"""Writes qr-civildigital.svg, the QR code on the back of the card.

    python3 make-qr.py

Links to https://civildigital.co.uk. Plum modules on a white tile; the tile
is the standard 4-module quiet zone, so the code scans against the plum card.
Version 2 (25 x 25), error correction M. Needs qrcode (pip install qrcode).
"""
from pathlib import Path

import qrcode

URL = 'https://civildigital.co.uk'
INK = '#7d0a70'
QUIET = 4

qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0)
qr.add_data(URL)
qr.make(fit=True)
matrix = qr.get_matrix()
size = len(matrix) + 2 * QUIET

# One path, one bar per run of dark modules in a row (no seams between them)
d = ''
for y, row in enumerate(matrix):
    x = 0
    while x < len(row):
        if row[x]:
            run = x
            while run < len(row) and row[run]:
                run += 1
            d += f'M{x + QUIET} {y + QUIET}h{run - x}v1h-{run - x}z'
            x = run
        else:
            x += 1
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}" shape-rendering="crispEdges">
  <!-- QR code for {URL}, made by make-qr.py -->
  <rect width="{size}" height="{size}" rx="1" fill="#ffffff"/>
  <path fill="{INK}" d="{d}"/>
</svg>
'''
Path(__file__).with_name('qr-civildigital.svg').write_text(svg)
