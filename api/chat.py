import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler

MAX_BODY = 120_000
MAX_MESSAGE = 4_000
MODEL = os.environ.get("XAI_MODEL", "grok-4.5")
BASE_URL = "https://api.x.ai/v1"

SYSTEM_PROMPT = """Eres FormalizaAI, asistente de orientacion para la formalizacion de pequena mineria y mineria artesanal en Peru. Responde en espanol, con pasos claros y breves. Los plazos y costos son orientativos. No inventes normas ni sustituyas asesoria legal; indica que los requisitos vigentes deben verificarse ante la autoridad competente."""


class handler(BaseHTTPRequestHandler):
    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _same_origin(self):
        origin = self.headers.get("Origin")
        host = self.headers.get("Host")
        if not origin or not host:
            return True
        return origin in (f"https://{host}", f"http://{host}")

    def do_POST(self):
        if not self._same_origin():
            self._json(403, {"ok": False, "error": "forbidden_origin"})
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > MAX_BODY:
                raise ValueError("Tamano de solicitud invalido")
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            message = str(data.get("message") or "").strip()
            if not message or len(message) > MAX_MESSAGE:
                raise ValueError("Mensaje vacio o demasiado largo")
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            self._json(400, {"ok": False, "error": "bad_request", "message": str(exc)})
            return

        api_key = os.environ.get("XAI_API_KEY", "").strip()
        if not api_key:
            self._json(503, {"ok": False, "error": "missing_api_key", "fallback": True})
            return

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        history = data.get("history") if isinstance(data.get("history"), list) else []
        for item in history[-12:]:
            if not isinstance(item, dict) or item.get("role") not in ("user", "assistant"):
                continue
            content = str(item.get("content") or item.get("text") or "").strip()[:3000]
            if content:
                messages.append({"role": item["role"], "content": content})
        messages.append({"role": "user", "content": message})

        request = urllib.request.Request(
            f"{BASE_URL}/chat/completions",
            data=json.dumps(
                {"model": MODEL, "messages": messages, "stream": False, "temperature": 0.4}
            ).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "FormalizaAI/1.0",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                result = json.loads(response.read().decode("utf-8"))
            choices = result.get("choices") or []
            text = ((choices[0].get("message") or {}).get("content") if choices else "") or ""
            if not text.strip():
                raise ValueError("La API no devolvio texto")
            self._json(
                200,
                {
                    "ok": True,
                    "text": text.strip(),
                    "model": result.get("model") or MODEL,
                    "source": "xai",
                },
            )
        except urllib.error.HTTPError as exc:
            self._json(502, {"ok": False, "error": "upstream_error", "status": exc.code, "fallback": True})
        except Exception:
            self._json(502, {"ok": False, "error": "proxy_error", "fallback": True})
