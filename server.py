#!/usr/bin/env python3
"""
FormalizaAI — servidor local estático + proxy del Asistente IA (xAI / SpaceXAI).

La API key NUNCA se expone al navegador.
  POST /api/chat     → reenvía a https://api.x.ai/v1/chat/completions
  GET  /api/health   → estado del proxy y si hay key configurada

Uso:
  set XAI_API_KEY=xai-...
  python server.py

  o crea un archivo .env en esta carpeta con:
  XAI_API_KEY=xai-...
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "8080"))
XAI_BASE = os.environ.get("XAI_BASE_URL", "https://api.x.ai/v1").rstrip("/")
DEFAULT_MODEL = os.environ.get("XAI_MODEL", "grok-4.5")
MAX_BODY = 120_000  # bytes
PUBLIC_PAGES = {
    "/",
    "/index.html",
    "/login.html",
    "/dashboard.html",
    "/diagnostico.html",
    "/documentos.html",
    "/chat.html",
    "/perfil.html",
}


def load_dotenv(path: Path) -> None:
    """Carga KEY=VALUE simples sin dependencia externa."""
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


load_dotenv(ROOT / ".env")


def get_api_key() -> str:
    return (os.environ.get("XAI_API_KEY") or os.environ.get("xai_api_key") or "").strip()


SYSTEM_PROMPT = """Eres FormalizaAI, asistente especializado en formalización de pequeña minería y minería artesanal en Perú.

Tu rol:
- Explicar de forma clara y práctica RUC, REINFO, IGAFOM, contratos de explotación, instrumentos ambientales (DIA/EIA), seguridad minera, SUCAMEC/explosivos, padrón laboral y ESSALUD/SCTR.
- Orientar pasos, plazos y costos de forma orientativa (no son cotizaciones oficiales).
- Usar el contexto del usuario (diagnóstico, región, documentos) cuando se te proporcione.
- Responder en español, con estructura breve: qué es, por qué importa, pasos, tiempos/costos si aplica, y un tip práctico.
- Si falta información crítica, haz 1–2 preguntas concretas.
- No inventes números de resoluciones ni plazos legales exactos si no estás seguro; indica que debe verificarse ante SUNAT, MINEM, DREM, SENACE o SUCAMEC.
- No des asesoría legal vinculante: es orientación para gestión y formalización.
- Si el usuario pide algo fuera de formalización minera, redirige con cortesía al tema de la app.

Formato: usa markdown ligero (negritas, listas, tablas cortas). Evita respuestas kilométricas salvo que pidan detalle."""


class FormalizaHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def end_headers(self) -> None:
        # Evitar caché agresiva en dev para JS/CSS
        if self.path.endswith((".js", ".css", ".html", ".json")):
            self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        if self.path.startswith("/api/"):
            if not self._origin_is_allowed():
                self.send_error(403, "Forbidden origin")
                return
            self.send_response(204)
            self._cors()
            self.end_headers()
            return
        self.send_error(404)

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path == "/api/health":
            self._json_response(
                200,
                {
                    "ok": True,
                    "service": "FormalizaAI",
                    "apiConfigured": bool(get_api_key()),
                    "model": DEFAULT_MODEL,
                    "provider": "xAI (SpaceXAI-compatible)",
                    "baseUrl": XAI_BASE,
                },
            )
            return
        # Servir solo la superficie publica. Evita exponer .env, codigo del
        # servidor, migraciones o archivos de configuracion desde ROOT.
        if path in PUBLIC_PAGES or path.startswith("/assets/"):
            return super().do_GET()
        self.send_error(404, "Not found")

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        if path == "/api/chat":
            if not self._origin_is_allowed():
                self._json_response(403, {"ok": False, "error": "forbidden_origin"})
                return
            self._handle_chat()
            return
        self.send_error(404, "Not found")

    def _origin_is_allowed(self) -> bool:
        origin = (self.headers.get("Origin") or "").rstrip("/")
        if not origin:
            return True
        host = self.headers.get("Host") or f"127.0.0.1:{PORT}"
        return origin in {f"http://{host}", f"https://{host}"}

    def _cors(self) -> None:
        origin = (self.headers.get("Origin") or "").rstrip("/")
        if origin and self._origin_is_allowed():
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            raise ValueError("Cuerpo vacío")
        if length > MAX_BODY:
            raise ValueError("Cuerpo demasiado grande")
        raw = self.rfile.read(length)
        data = json.loads(raw.decode("utf-8"))
        if not isinstance(data, dict):
            raise ValueError("JSON inválido")
        return data

    def _json_response(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _handle_chat(self) -> None:
        """
        Chat con streaming por defecto (SSE).
        Body: { message, history?, context?, model?, stream?: true|false }
        SSE events: meta | delta | done | error
        """
        try:
            data = self._read_json()
        except Exception as exc:
            self._json_response(400, {"ok": False, "error": "bad_request", "message": str(exc)})
            return

        user_message = (data.get("message") or "").strip()
        if not user_message:
            self._json_response(
                400, {"ok": False, "error": "empty_message", "message": "Escribe un mensaje."}
            )
            return
        if len(user_message) > 4000:
            self._json_response(
                400,
                {
                    "ok": False,
                    "error": "message_too_long",
                    "message": "El mensaje es demasiado largo (máx. 4000 caracteres).",
                },
            )
            return

        want_stream = data.get("stream", True)
        if isinstance(want_stream, str):
            want_stream = want_stream.lower() not in ("0", "false", "no")

        api_key = get_api_key()
        if not api_key:
            payload_err = {
                "ok": False,
                "error": "missing_api_key",
                "message": (
                    "No hay XAI_API_KEY configurada. "
                    "Crea un archivo .env con XAI_API_KEY=... o define la variable de entorno. "
                    "Obtén una clave en https://console.x.ai"
                ),
                "fallback": True,
            }
            if want_stream:
                self._sse_error_response(payload_err)
            else:
                self._json_response(503, payload_err)
            return

        history = data.get("history") or []
        if not isinstance(history, list):
            history = []

        context = data.get("context") or {}
        model = (data.get("model") or DEFAULT_MODEL).strip() or DEFAULT_MODEL
        messages = _build_messages(user_message, history, context)

        if want_stream:
            self._stream_chat(api_key, model, messages)
        else:
            self._sync_chat(api_key, model, messages)

    def _sse_headers(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        # Cerrar al terminar el handler para que el cliente no quede esperando
        self.send_header("Connection", "close")
        self.send_header("X-Accel-Buffering", "no")
        self._cors()
        self.end_headers()

    def _sse_write(self, obj: dict) -> None:
        line = "data: " + json.dumps(obj, ensure_ascii=False) + "\n\n"
        self.wfile.write(line.encode("utf-8"))
        try:
            self.wfile.flush()
        except Exception:
            pass

    def _sse_error_response(self, payload: dict) -> None:
        """Envía un único stream con error (el cliente puede hacer fallback)."""
        try:
            self._sse_headers()
            self._sse_write(
                {
                    "type": "error",
                    "error": payload.get("error"),
                    "message": payload.get("message"),
                    "fallback": payload.get("fallback", True),
                    "status": payload.get("status"),
                }
            )
            self._sse_write({"type": "done", "ok": False})
        except Exception:
            pass

    def _stream_chat(self, api_key: str, model: str, messages: list) -> None:
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "temperature": 0.4,
        }
        url = f"{XAI_BASE}/chat/completions"
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
                "User-Agent": "FormalizaAI/1.0",
                "Accept": "text/event-stream",
            },
        )

        try:
            upstream = urllib.request.urlopen(req, timeout=3600)
        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8", errors="replace")[:800]
            msg = _parse_upstream_error(err_body) or str(exc)
            self._sse_error_response(
                {
                    "error": "upstream_error",
                    "status": exc.code,
                    "message": f"Error de la API xAI ({exc.code}): {msg}",
                    "fallback": True,
                }
            )
            return
        except Exception as exc:
            self._sse_error_response(
                {
                    "error": "proxy_error",
                    "message": f"No se pudo contactar la API: {exc}",
                    "fallback": True,
                }
            )
            return

        self._sse_headers()
        self._sse_write({"type": "meta", "model": model, "source": "xai", "stream": True})

        full_parts = []
        resolved_model = model

        try:
            while True:
                raw_line = upstream.readline()
                if not raw_line:
                    break
                line = raw_line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                if line.startswith(":"):
                    # comentario SSE / keep-alive
                    continue
                if not line.startswith("data:"):
                    continue
                data_str = line[5:].strip()
                if data_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                except json.JSONDecodeError:
                    continue

                if chunk.get("model"):
                    resolved_model = chunk["model"]

                choices = chunk.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                piece = delta.get("content")
                if piece:
                    full_parts.append(piece)
                    self._sse_write({"type": "delta", "text": piece})

                # finish_reason a veces llega en el último chunk
                fr = choices[0].get("finish_reason")
                if fr and fr != "null":
                    pass

            full_text = "".join(full_parts).strip()
            self._sse_write(
                {
                    "type": "done",
                    "ok": True,
                    "text": full_text,
                    "model": resolved_model,
                    "source": "xai",
                }
            )
        except Exception as exc:
            self._sse_write(
                {
                    "type": "error",
                    "error": "stream_error",
                    "message": f"Stream interrumpido: {exc}",
                    "fallback": True,
                }
            )
            self._sse_write({"type": "done", "ok": False})
        finally:
            try:
                upstream.close()
            except Exception:
                pass

    def _sync_chat(self, api_key: str, model: str, messages: list) -> None:
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            "temperature": 0.4,
        }
        try:
            result = _xai_chat(api_key, payload)
        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8", errors="replace")[:800]
            msg = _parse_upstream_error(err_body) or str(exc)
            self._json_response(
                502,
                {
                    "ok": False,
                    "error": "upstream_error",
                    "status": exc.code,
                    "message": f"Error de la API xAI ({exc.code}): {msg}",
                    "fallback": True,
                },
            )
            return
        except Exception as exc:
            self._json_response(
                502,
                {
                    "ok": False,
                    "error": "proxy_error",
                    "message": f"No se pudo contactar la API: {exc}",
                    "fallback": True,
                },
            )
            return

        text = _extract_text(result)
        if not text:
            self._json_response(
                502,
                {
                    "ok": False,
                    "error": "empty_response",
                    "message": "La API no devolvió texto.",
                    "fallback": True,
                },
            )
            return

        self._json_response(
            200,
            {
                "ok": True,
                "text": text,
                "model": result.get("model") or model,
                "usage": result.get("usage"),
                "source": "xai",
            },
        )


def _build_messages(user_message: str, history: list, context: dict) -> list:
    system = SYSTEM_PROMPT
    ctx_block = _format_context(context)
    if ctx_block:
        system += "\n\n## Contexto del usuario en FormalizaAI\n" + ctx_block

    messages = [{"role": "system", "content": system}]
    for item in history[-12:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = (item.get("content") or item.get("text") or "").strip()
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content[:3000]})
    messages.append({"role": "user", "content": user_message})
    return messages


def _parse_upstream_error(err_body: str) -> str:
    try:
        err_json = json.loads(err_body)
        if isinstance(err_json.get("error"), dict):
            return err_json["error"].get("message") or err_body
        if err_json.get("error"):
            return str(err_json["error"])
        return err_body
    except Exception:
        return err_body


def _format_context(ctx: dict) -> str:
    if not isinstance(ctx, dict) or not ctx:
        return ""
    lines = []
    if ctx.get("nombre"):
        lines.append(f"- Nombre: {ctx['nombre']}")
    if ctx.get("region"):
        lines.append(f"- Región: {ctx['region']}")
    if ctx.get("actividad"):
        lines.append(f"- Actividad: {ctx['actividad']}")
    if ctx.get("porcentaje") is not None:
        lines.append(f"- % formalización (diagnóstico): {ctx['porcentaje']}%")
    if ctx.get("estado"):
        lines.append(f"- Estado: {ctx['estado']}")
    if ctx.get("riesgo"):
        lines.append(f"- Riesgo: {ctx['riesgo']}")
    if ctx.get("proximoPaso"):
        lines.append(f"- Próximo paso: {ctx['proximoPaso']}")
    if ctx.get("documentosFaltantes"):
        docs = ctx["documentosFaltantes"]
        if isinstance(docs, list) and docs:
            lines.append("- Documentos / requisitos faltantes: " + ", ".join(str(d) for d in docs[:12]))
    if ctx.get("porcentajeDocumental") is not None:
        lines.append(f"- Avance documental: {ctx['porcentajeDocumental']}%")
    if ctx.get("resumenIA"):
        lines.append(f"- Resumen diagnóstico: {ctx['resumenIA']}")
    return "\n".join(lines)


def _xai_chat(api_key: str, payload: dict) -> dict:
    url = f"{XAI_BASE}/chat/completions"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "FormalizaAI/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw)


def _extract_text(result: dict) -> str:
    try:
        choices = result.get("choices") or []
        if not choices:
            return ""
        msg = choices[0].get("message") or {}
        content = msg.get("content")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            parts = []
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    parts.append(part.get("text") or "")
                elif isinstance(part, str):
                    parts.append(part)
            return "\n".join(parts).strip()
    except Exception:
        return ""
    return ""


def main() -> None:
    os.chdir(ROOT)
    key = get_api_key()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), FormalizaHandler)
    print()
    print("  FormalizaAI — servidor + proxy IA (xAI)")
    print("  --------------------------------------")
    print(f"  URL:     http://localhost:{PORT}")
    print(f"  Modelo:  {DEFAULT_MODEL}")
    print(f"  API key: {'configurada ✓' if key else 'NO configurada — modo fallback local'}")
    if not key:
        print("  Tip: crea .env con XAI_API_KEY=...  →  https://console.x.ai")
    print("  Ctrl+C para detener")
    print()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDetenido.")
        server.server_close()


if __name__ == "__main__":
    main()
