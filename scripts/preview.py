"""Open the local DeskWorld app without a package install."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser

root = Path(__file__).resolve().parent.parent / 'dist'
handler = partial(SimpleHTTPRequestHandler, directory=str(root))
with ThreadingHTTPServer(('127.0.0.1', 8806), handler) as server:
    address = f'http://127.0.0.1:{server.server_port}/'
    print(f'DeskWorld is ready at {address}')
    print('Keep this window open while you play; press Control-C to stop.')
    threading.Timer(0.5, lambda: webbrowser.open(address)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nDeskWorld stopped.')
