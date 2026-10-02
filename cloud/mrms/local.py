"""Local build: python local.py <output-dir> [--loop] [--serve PORT]

Reads the real public bucket and writes frames to <output-dir>.
  --loop        keep building every 2 minutes, like the deployed schedule
  --serve PORT  also serve <output-dir> over HTTP with CORS, standing in for
                CloudFront: VITE_MRMS_URL=http://localhost:PORT/mrms
"""

import functools
import http.server
import json
import sys
import threading
import time

from builder import MrmsBuilder
from metrics import log
from source import MrmsSource
from store import LocalStore


class CorsHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache' if self.path.endswith('.json') else 'public, max-age=31536000, immutable')
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    argv = sys.argv[1:]
    port = int(argv[argv.index('--serve') + 1]) if '--serve' in argv else None
    args = [a for i, a in enumerate(argv) if not a.startswith('--') and (i == 0 or argv[i - 1] != '--serve')]
    out = args[0] if args else 'dev-frames'
    if port:
        server = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(CorsHandler, directory=out))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        print(f'serving {out} at http://localhost:{port}/mrms', flush=True)
    while True:
        builder = MrmsBuilder(MrmsSource(), LocalStore(out), log=lambda sev, msg, **f: log(sev, msg, **f))
        print(json.dumps(builder.run(), indent=2), flush=True)
        if '--loop' not in argv:
            break
        time.sleep(120)
