#!/usr/bin/env python3
"""Genera los iconos de WTD desde public/favicon.svg.

Ejecutar con Python 3, PyGObject/librsvg, pycairo y Pillow:
    python3 scripts/generate-icons.py
"""
from io import BytesIO
from pathlib import Path

import cairo
import gi
from PIL import Image

gi.require_version('Rsvg', '2.0')
from gi.repository import Rsvg

PUBLIC = Path(__file__).resolve().parent.parent / 'public'
SIZE = 1024
svg = Rsvg.Handle.new_from_file(str(PUBLIC / 'favicon.svg'))
surface = cairo.ImageSurface(cairo.FORMAT_ARGB32, SIZE, SIZE)
context = cairo.Context(surface)
# Los PNG instalables tienen fondo opaco para Apple y las máscaras del sistema.
context.set_source_rgb(1, 1, 1)
context.paint()
viewport = Rsvg.Rectangle()
viewport.x = viewport.y = 0
viewport.width = viewport.height = SIZE
svg.render_document(context, viewport)
buffer = BytesIO()
surface.write_to_png(buffer)
buffer.seek(0)
master = Image.open(buffer).convert('RGB')

for name, size in [
    ('favicon-16x16.png', 16),
    ('favicon-32x32.png', 32),
    ('apple-touch-icon.png', 180),
    ('android-chrome-192x192.png', 192),
    ('android-chrome-256x256.png', 256),
    ('android-chrome-512x512.png', 512),
]:
    master.resize((size, size), Image.Resampling.LANCZOS).save(PUBLIC / name)

master.save(PUBLIC / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print('Generados seis PNG y favicon.ico desde el SVG de WTD.')
