#!/usr/bin/env python3
"""
USA Cop Watch — Local Admin Server
Run:  python admin/serve.py
Then open:  http://localhost:8765/admin.html
"""
import json
import os
import shutil
import sys
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

# Paths (relative to repo root, one level up from admin/)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(ROOT, "data", "officers.json")
BACKUP_DIR = os.path.join(ROOT, "data", ".backups")
ADMIN_DIR = os.path.dirname(os.path.abspath(__file__))

PORT = 8765


def ensure_dirs():
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    os.makedirs(BACKUP_DIR, exist_ok=True)


def backup_current():
    if not os.path.exists(DATA_FILE):
        return
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    dst = os.path.join(BACKUP_DIR, f"officers-{ts}.json")
    shutil.copy2(DATA_FILE, dst)
    # keep only last 20 backups
    files = sorted(os.listdir(BACKUP_DIR))
    for old in files[:-20]:
        try:
            os.remove(os.path.join(BACKUP_DIR, old))
        except OSError:
            pass


class AdminHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write("[admin] " + (fmt % args) + "\n")

    def _send(self, status, body, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length) if length else b""

    def do_OPTIONS(self):
        self._send(200, b"")

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/officers":
            if not os.path.exists(DATA_FILE):
                return self._send(200, [])
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                try:
                    data = json.load(f)
                except json.JSONDecodeError as e:
                    return self._send(500, {"error": f"Invalid JSON: {e}"})
            return self._send(200, data)

        # serve static admin files
        if path in ("/", "/admin.html"):
            path = "/admin.html"
        rel = path.lstrip("/")
        file_path = os.path.join(ADMIN_DIR, rel)

        if not os.path.abspath(file_path).startswith(os.path.abspath(ADMIN_DIR)):
            return self._send(403, "Forbidden", "text/plain")

        if not os.path.isfile(file_path):
            return self._send(404, "Not found", "text/plain")

        ctype = "text/plain"
        if file_path.endswith(".html"): ctype = "text/html; charset=utf-8"
        elif file_path.endswith(".css"): ctype = "text/css; charset=utf-8"
        elif file_path.endswith(".js"):  ctype = "application/javascript; charset=utf-8"

        with open(file_path, "rb") as f:
            self._send(200, f.read(), ctype)

    def do_POST(self):
        path = urlparse(self.path).path

        if path == "/api/save":
            raw = self._read_body()
            try:
                data = json.loads(raw.decode("utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                return self._send(400, {"error": f"Invalid JSON body: {e}"})

            if not isinstance(data, list):
                return self._send(400, {"error": "Top-level value must be an array"})

            # Validate required fields on each entry
            required = ["id", "name", "state_name", "county_fips", "former_department",
                        "separation_type", "status", "sources"]
            for i, entry in enumerate(data):
                for field in required:
                    if field not in entry:
                        return self._send(400, {
                            "error": f"Entry {i} ('{entry.get('name', '?')}') missing field '{field}'"
                        })
                if not isinstance(entry["sources"], list):
                    return self._send(400, {
                        "error": f"Entry {i} ('{entry.get('name', '?')}') sources must be an array"
                    })

            backup_current()
            tmp = DATA_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write("\n")
            os.replace(tmp, DATA_FILE)

            return self._send(200, {"ok": True, "count": len(data)})

        return self._send(404, {"error": "Unknown endpoint"})

    def do_DELETE(self):
        self._send(405, {"error": "Method not allowed"})


def main():
    ensure_dirs()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), AdminHandler)
    print(f"USA Cop Watch admin running")
    print(f"  Data file: {DATA_FILE}")
    print(f"  Open: http://localhost:{PORT}/admin.html")
    print(f"  Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
