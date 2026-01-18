import http.server
import socketserver
import webbrowser
from pathlib import Path

PORT = 8004
HERE = Path(__file__).parent

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(HERE), **kwargs)

if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}/index.html"
        print("Serving:", url)
        try:
            webbrowser.open(url)
        except Exception:
            pass
        httpd.serve_forever()
