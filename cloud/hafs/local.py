"""Local server: python local.py [PORT]

Serves the same handler as the Lambda over plain HTTP, reading the real
public bucket. The frontend points at it the way it points at CloudFront:
VITE_HAFS_URL=http://localhost:PORT/hafs (the /hafs prefix is optional here).
"""

import http.server
import sys
from urllib.parse import urlsplit

from lambda_handler import app


class Handler(http.server.BaseHTTPRequestHandler):
    def _serve(self):
        parts = urlsplit(self.path)
        resp = app().handle(self.command, parts.path, parts.query, self.client_address[0], self.headers.get('Origin'))
        body = resp.payload()
        self.send_response(resp.status)
        self.send_header('Content-Type', resp.content_type)
        self.send_header('Content-Length', str(len(body)))
        for k, v in resp.headers.items():
            if k != 'Content-Type':
                self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    do_GET = do_HEAD = do_OPTIONS = do_POST = _serve

    def log_message(self, *args):
        pass  # the handler logs every request as JSON


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8098
    print(f'HAFS service at http://localhost:{port}/hafs', flush=True)
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
