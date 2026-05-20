"""Genere un QR code brande DjamikShop pointant vers le site (ou Play Store).

Usage :
    python scripts/gen-qr.py
    python scripts/gen-qr.py --url https://djamikshop-v5.vercel.app
"""
import os, sys, argparse
import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers import RoundedModuleDrawer
from qrcode.image.styles.colormasks import SolidFillColorMask
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LOGO_PATH = os.path.join(ROOT, "assets", "icons", "icon-512.png")
OUT_DIR = os.path.join(ROOT, "assets", "qr")
os.makedirs(OUT_DIR, exist_ok=True)

# ── Args ──
parser = argparse.ArgumentParser()
parser.add_argument("--url", default="https://djamikshop-v5.vercel.app", help="URL to encode")
parser.add_argument("--out", default="djamikshop-qr.png", help="Output filename")
parser.add_argument("--size", type=int, default=1080, help="Output size in px")
parser.add_argument("--no-logo", action="store_true", help="Skip embedding logo")
parser.add_argument("--no-label", action="store_true", help="Skip footer label")
args = parser.parse_args()

# ── 1. Generate QR with brand colors ──
qr = qrcode.QRCode(
    version=None,
    error_correction=qrcode.constants.ERROR_CORRECT_H,  # H = max (30%) — needed for logo overlay
    box_size=20,
    border=2,
)
qr.add_data(args.url)
qr.make(fit=True)

# Brand colors : orange #E8501A on white
img = qr.make_image(
    image_factory=StyledPilImage,
    module_drawer=RoundedModuleDrawer(),
    color_mask=SolidFillColorMask(
        back_color=(255, 255, 255),
        front_color=(232, 80, 26),  # DjamikShop orange #E8501A
    ),
).convert("RGBA")

# ── 2. Embed logo in center ──
if not args.no_logo and os.path.exists(LOGO_PATH):
    logo = Image.open(LOGO_PATH).convert("RGBA")
    # Logo occupies ~22% of QR width
    qr_w = img.size[0]
    logo_size = int(qr_w * 0.22)
    logo.thumbnail((logo_size, logo_size), Image.LANCZOS)

    # White rounded bg behind logo for legibility
    bg_size = logo_size + 30
    bg = Image.new("RGBA", (bg_size, bg_size), (255, 255, 255, 255))
    bg_mask = Image.new("L", (bg_size, bg_size), 0)
    ImageDraw.Draw(bg_mask).rounded_rectangle([0, 0, bg_size, bg_size], radius=20, fill=255)
    bg.putalpha(bg_mask)

    bg_pos = ((qr_w - bg_size) // 2, (qr_w - bg_size) // 2)
    img.paste(bg, bg_pos, bg)

    logo_pos = ((qr_w - logo.size[0]) // 2, (qr_w - logo.size[1]) // 2)
    img.paste(logo, logo_pos, logo)

# ── 3. Add brand footer label ──
if not args.no_label:
    qr_w = img.size[0]
    footer_h = 140
    final = Image.new("RGBA", (qr_w, qr_w + footer_h), (255, 255, 255, 255))
    final.paste(img, (0, 0))

    draw = ImageDraw.Draw(final)
    try:
        font_big = ImageFont.truetype("arialbd.ttf", 56)
        font_small = ImageFont.truetype("arial.ttf", 32)
    except:
        font_big = ImageFont.load_default()
        font_small = ImageFont.load_default()

    # "DjamikShop" en orange
    title = "DjamikShop"
    bbox = draw.textbbox((0, 0), title, font=font_big)
    tw = bbox[2] - bbox[0]
    draw.text(((qr_w - tw) // 2, qr_w + 15), title, fill=(232, 80, 26), font=font_big)

    # "Scanne pour decouvrir" en gris
    sub = "Scanne pour decouvrir"
    bbox = draw.textbbox((0, 0), sub, font=font_small)
    tw = bbox[2] - bbox[0]
    draw.text(((qr_w - tw) // 2, qr_w + 80), sub, fill=(100, 100, 100), font=font_small)

    img = final

# ── 4. Resize to target ──
img = img.resize((args.size, int(img.size[1] * args.size / img.size[0])), Image.LANCZOS)

out_path = os.path.join(OUT_DIR, args.out)
img.convert("RGB").save(out_path, "PNG", quality=95)
print(f"OK QR genere : {out_path}")
print(f"   URL : {args.url}")
print(f"   Taille : {img.size}")
