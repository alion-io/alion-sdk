"""A webhook receiver for Alion watches and agent events, standard library only. It checks the X-Alion-Signature of
every delivery before trusting it.

    pip install alion
    export ALION_WEBHOOK_SECRET=...   # shown once by set_webhook or watch_search(deliver="webhook")
    python webhook_receiver.py        # listens on :8080; put it behind https
"""

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

from alion import verify_webhook

SECRET = os.environ.get("ALION_WEBHOOK_SECRET", "")


class Hook(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        if not verify_webhook(body, self.headers.get("X-Alion-Signature"), SECRET):
            self.send_response(401)
            self.end_headers()
            return
        payload = json.loads(body)
        print(self.headers.get("X-Alion-Event"), json.dumps(payload)[:300], flush=True)
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    HTTPServer(("", int(os.environ.get("PORT", "8080"))), Hook).serve_forever()
