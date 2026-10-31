"""Render the 🐺 emoji for webOS, which may lack a color emoji font.

Optional development tool: Pillow and Noto Color Emoji are required.
Usage: python3 scripts/generate-icons.py [path/to/NotoColorEmoji.ttf]
"""
from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent
font = ImageFont.truetype(sys.argv[1] if len(sys.argv) > 1 else
                          '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf', 109)
glyph = Image.new('RGBA', (160, 160))
ImageDraw.Draw(glyph).text((0, 0), '🐺', font=font, embedded_color=True)
glyph = glyph.crop(glyph.getbbox())
glyph.save(root / 'app/wolf.png')
for name, size in [('icon.png', 120), ('icon-large.png', 256)]:
    icon = Image.new('RGBA', (size, size))
    ImageDraw.Draw(icon).rounded_rectangle((0, 0, size - 1, size - 1),
                                           radius=size // 5, fill='#151b26')
    # Resize up for the large launcher icon as well.
    ratio = min(size * .8 / glyph.width, size * .8 / glyph.height)
    wolf = glyph.resize((round(glyph.width * ratio), round(glyph.height * ratio)),
                        Image.Resampling.LANCZOS)
    icon.alpha_composite(wolf, ((size - wolf.width) // 2, (size - wolf.height) // 2))
    icon.save(root / 'app' / name)
