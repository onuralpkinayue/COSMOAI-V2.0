import http.server, socketserver, os
PORT = 8007
os.chdir(os.path.dirname(__file__))
Handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at http://localhost:{PORT}/index.html")
    httpd.serve_forever()
