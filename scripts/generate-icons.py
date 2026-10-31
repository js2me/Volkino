"""Export webOS/browser icon sizes from the prepared VolKino logo.

Optional development tool: only Pillow is required; no fonts or network calls.
Usage: python3 scripts/generate-icons.py
The supplied reference and prepared square master live in src/app/assets/.
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
with Image.open(root / 'src/app/assets/logo.png') as logo:
    for name, size in [('wolf.png', 256), ('icon.png', 120), ('icon-large.png', 256)]:
        logo.convert('RGB').resize((size, size), Image.Resampling.LANCZOS).save(
            root / 'app' / name, optimize=True)
