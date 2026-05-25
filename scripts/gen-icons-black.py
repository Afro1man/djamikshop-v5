"""Genere les declinaisons d'icones avec FOND NOIR + carte Niger transparente.
Look beaucoup plus 'app moderne' (style Spotify/Netflix/etc.)

Source : icon-transparent-2048.png (fond alpha, carte Niger orange + D dore + icones)
Output : remplace toutes les declinaisons existantes par la version fond noir.
"""
import os
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ICONS_DIR = os.path.join(ROOT, "assets", "icons")
WWW_ICONS = os.path.join(ROOT, "www", "assets", "icons")
ANDROID_RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

BLACK = (10, 10, 10, 255)   # Noir tres legerement adouci (pas du #000 pur)

# ─── Load source transparent ───
src_transparent = Image.open(os.path.join(ICONS_DIR, "icon-transparent-2048.png")).convert("RGBA")
print(f"Source transparent: {src_transparent.size}")

# ─── Helper : compose le logo sur fond noir, taille X ───
def make_on_black(size, scale=0.78):
    """Cree un PNG carre `size`x`size` avec fond noir + logo centre a `scale` ratio."""
    canvas = Image.new("RGBA", (size, size), BLACK)
    logo_size = int(size * scale)
    logo = src_transparent.resize((logo_size, logo_size), Image.LANCZOS)
    pos = ((size - logo_size) // 2, (size - logo_size) // 2)
    canvas.paste(logo, pos, logo)
    return canvas

# ─── 1. Master icon-1024 + icon-512 (avec fond noir) ───
master_1024 = make_on_black(1024, scale=0.80)
master_1024.save(os.path.join(ICONS_DIR, "icon-1024.png"), optimize=True)
master_1024.save(os.path.join(WWW_ICONS, "icon-1024.png"), optimize=True)
print("OK icon-1024.png (fond noir)")

master_512 = master_1024.resize((512, 512), Image.LANCZOS)
master_512.save(os.path.join(ICONS_DIR, "icon-512.png"), optimize=True)
master_512.save(os.path.join(WWW_ICONS, "icon-512.png"), optimize=True)
print("OK icon-512.png (fond noir)")

# ─── 2. PWA icons multiples ───
pwa_sizes = [
    ("icon-192.png", 192),
    ("icon-180.png", 180),
    ("icon-152.png", 152),
    ("icon-144.png", 144),
    ("icon-120.png", 120),
    ("icon-96.png", 96),
    ("icon-72.png", 72),
    ("icon-48.png", 48),
]
for name, size in pwa_sizes:
    img = master_1024.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(ICONS_DIR, name), optimize=True)
    img.save(os.path.join(WWW_ICONS, name), optimize=True)
    print(f"OK {name}")

# ─── 3. Favicons (logo prend toute la place car petit format) ───
for size in [16, 32]:
    # Pour les favicons, on prend juste la carte Niger plus zoomee (sans trop de noir autour)
    canvas = Image.new("RGBA", (size, size), BLACK)
    logo_size = int(size * 0.88)
    logo = src_transparent.resize((logo_size, logo_size), Image.LANCZOS)
    pos = ((size - logo_size) // 2, (size - logo_size) // 2)
    canvas.paste(logo, pos, logo)
    fav_name = f"favicon-{size}.png"
    canvas.save(os.path.join(ICONS_DIR, fav_name), optimize=True)
    canvas.save(os.path.join(WWW_ICONS, fav_name), optimize=True)
    print(f"OK {fav_name}")

# favicon.ico multi-size
ico_img = make_on_black(48, scale=0.85)
ico_img.save(os.path.join(ICONS_DIR, "favicon.ico"), format="ICO", sizes=[(16,16),(32,32),(48,48)])
ico_img.save(os.path.join(WWW_ICONS, "favicon.ico"), format="ICO", sizes=[(16,16),(32,32),(48,48)])
print("OK favicon.ico")

# ─── 4. Maskable (Android safe zone) ───
# Pour le maskable Android, le logo doit etre dans la "safe zone" centrale (60-70% du canvas)
# Le reste etant rempli (ici noir) qui sera coupe par le launcher en cercle/squircle
mask_1024 = Image.new("RGBA", (1024, 1024), BLACK)
mask_logo_size = int(1024 * 0.62)   # plus reserre pour le safe zone
mask_logo = src_transparent.resize((mask_logo_size, mask_logo_size), Image.LANCZOS)
mask_logo_pos = ((1024 - mask_logo_size) // 2, (1024 - mask_logo_size) // 2)
mask_1024.paste(mask_logo, mask_logo_pos, mask_logo)
mask_1024.save(os.path.join(ICONS_DIR, "icon-maskable-1024.png"), optimize=True)
mask_1024.save(os.path.join(WWW_ICONS, "icon-maskable-1024.png"), optimize=True)
print("OK icon-maskable-1024.png (fond noir + safe zone 62%)")

mask_512 = mask_1024.resize((512, 512), Image.LANCZOS)
mask_512.save(os.path.join(ICONS_DIR, "icon-maskable-512.png"), optimize=True)
mask_512.save(os.path.join(WWW_ICONS, "icon-maskable-512.png"), optimize=True)
print("OK icon-maskable-512.png")

# ─── 5. Android launcher (mipmap-*) ───
android_sizes = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}
for folder, size in android_sizes.items():
    out = os.path.join(ANDROID_RES, folder)
    if not os.path.exists(out):
        continue
    img = master_1024.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(out, "ic_launcher.png"), optimize=True)
    img.save(os.path.join(out, "ic_launcher_round.png"), optimize=True)
    # foreground = maskable
    fg_size = int(size * 1.5)
    fg = mask_1024.resize((fg_size, fg_size), Image.LANCZOS)
    fg.save(os.path.join(out, "ic_launcher_foreground.png"), optimize=True)
    print(f"OK android {folder} ({size}px)")

# ─── 6. Splash screens (fond noir aussi pour coherence !) ───
splash_sizes = {
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
}
for folder, (w, h) in splash_sizes.items():
    out = os.path.join(ANDROID_RES, folder)
    if not os.path.exists(out):
        continue
    canvas = Image.new("RGBA", (w, h), BLACK)
    logo_size = int(min(w, h) * 0.42)
    logo = src_transparent.resize((logo_size, logo_size), Image.LANCZOS)
    canvas.paste(logo, ((w - logo_size) // 2, (h - logo_size) // 2), logo)
    canvas.save(os.path.join(out, "splash.png"), optimize=True)
    print(f"OK splash {folder} ({w}x{h})")

# ─── 7. Splash master ───
splash_master = Image.new("RGBA", (2732, 2732), BLACK)
splash_logo_size = int(2732 * 0.40)
splash_logo = src_transparent.resize((splash_logo_size, splash_logo_size), Image.LANCZOS)
splash_master.paste(splash_logo, ((2732 - splash_logo_size) // 2, (2732 - splash_logo_size) // 2), splash_logo)
splash_master.save(os.path.join(ICONS_DIR, "splash-2732.png"), optimize=True)
splash_master.save(os.path.join(WWW_ICONS, "splash-2732.png"), optimize=True)
print("OK splash-2732.png")

print("\nDONE - tout regenere avec fond NOIR")
