import json
import os
from http.server import BaseHTTPRequestHandler


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps(
            {
                "ok": True,
                "service": "FormalizaAI",
                "apiConfigured": bool(os.environ.get("XAI_API_KEY", "").strip()),
                "model": os.environ.get("XAI_MODEL", "grok-4.5"),
                "provider": "xAI",
            }
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
