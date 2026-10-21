"""Crops each page of the card PDF to exactly 88 x 58 mm and marks the trim.

Chromium rounds PDF page sizes, so build.js renders a slightly larger page
with the card in its top-left corner. This sets the MediaBox, CropBox and
BleedBox to that 88 x 58 mm card and the TrimBox 1.5 mm inside it (85 x 55),
matching Vistaprint's EU design template.

    python3 set-boxes.py civil-digital-business-card.pdf
"""
import sys
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject

PT = 72 / 25.4
WIDTH, HEIGHT, BLEED = 88 * PT, 58 * PT, 1.5 * PT

path = sys.argv[1]
reader = PdfReader(path)
writer = PdfWriter()
for page in reader.pages:
    top = float(page.mediabox.top)
    left = float(page.mediabox.left)
    card = RectangleObject([left, top - HEIGHT, left + WIDTH, top])
    page.mediabox = page.cropbox = page.bleedbox = card
    page.trimbox = RectangleObject([left + BLEED, top - HEIGHT + BLEED,
                                    left + WIDTH - BLEED, top - BLEED])
    writer.add_page(page)
with open(path, 'wb') as f:
    writer.write(f)
