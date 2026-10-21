"""Turns Chromium's card PDF into Vistaprint-ready artwork.

    python3 finish-pdf.py civil-digital-business-card.pdf

1. Crop. Chromium rounds PDF page sizes and clips, so build.js prints each
   card on a 90 x 60 mm page with a 1 mm border in its own colour. Each page
   is cropped to the 88 x 58 mm artwork inside that border.
2. Outline. Chromium embeds the fonts as Type 3, which Vistaprint rejects as
   "unembedded fonts". pdftocairo (poppler) writes each page as SVG with
   every glyph as a path, and cairosvg writes that back to PDF, so the file
   has no fonts at all and nothing to substitute.
3. Mark. The BleedBox is the full 88 x 58 mm page and the TrimBox sits 1.5 mm
   inside it (85 x 55), matching Vistaprint's EU design template.

Needs pdftocairo, pypdf and cairosvg (pip install pypdf cairosvg).
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import cairosvg
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject

PT = 72 / 25.4
WIDTH, HEIGHT, BLEED, INSET = 88 * PT, 58 * PT, 1.5 * PT, 1 * PT

path = Path(sys.argv[1])
with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)

    cropped = PdfWriter()
    for page in PdfReader(path).pages:
        top = float(page.mediabox.top) - INSET
        left = float(page.mediabox.left) + INSET
        page.mediabox = page.cropbox = RectangleObject(
            [left, top - HEIGHT, left + WIDTH, top])
        cropped.add_page(page)
    cropped.write(tmp / 'cropped.pdf')

    out = PdfWriter()
    for n in range(1, len(cropped.pages) + 1):
        svg, pdf = tmp / f'page-{n}.svg', tmp / f'page-{n}.pdf'
        # Without -nocenter -noshrink it clips a hairline off the edges
        subprocess.run(['pdftocairo', '-svg', '-nocenter', '-noshrink',
                        '-f', str(n), '-l', str(n), tmp / 'cropped.pdf', svg],
                       check=True)
        # The SVG is in points; at 72 dpi one unit is one point again
        cairosvg.svg2pdf(url=str(svg), write_to=str(pdf), dpi=72)
        page = PdfReader(pdf).pages[0]
        box = page.mediabox
        page.bleedbox = RectangleObject(box)
        page.trimbox = RectangleObject([box.left + BLEED, box.bottom + BLEED,
                                        box.right - BLEED, box.top - BLEED])
        out.add_page(page)
    out.write(path)
