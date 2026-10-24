"""Local build: python local.py <output-dir> [--serve PORT]

Pulls the real public sources and writes outputs to <output-dir>.
  --serve PORT  also serve <output-dir> over HTTP with CORS, standing in for
                CloudFront: VITE_FIRE_DANGER_URL=http://localhost:PORT/fire-danger
"""

import functools
import http.server
import json
import sys
import threading

from builder import FireDangerBuilder
from metrics import log
from store import LocalStore


class CorsHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache' if self.path.endswith('manifest.json') else 'public, max-age=31536000, immutable')
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    argv = sys.argv[1:]
    port = int(argv[argv.index('--serve') + 1]) if '--serve' in argv else None
    args = [a for i, a in enumerate(argv) if not a.startswith('--') and (i == 0 or argv[i - 1] != '--serve')]
    out = args[0] if args else 'dev-fire-danger'
    summary = FireDangerBuilder(LocalStore(out), log=lambda sev, msg, **f: log(sev, msg, **f)).run()
    print(json.dumps(summary['manifest'], indent=2), flush=True)
    if port:
        server = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(CorsHandler, directory=out))
        print(f'serving {out} at http://localhost:{port}/fire-danger', flush=True)
        server.serve_forever()
