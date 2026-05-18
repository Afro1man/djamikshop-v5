"""Génère toutes les déclinaisons d'icônes depuis les 7 masters dans assets/icons/.

Sources requises :
  - icon-1024.png             → master pour toutes les tailles PWA + Android launcher
  - icon-512.png              → master 512 (déjà optimisé)
  - icon-maskable-1024.png    → master pour Android maskable / safe zone
  - icon-transparent-2048.png → master pour splash screen
  - favicon-16.png / favicon-32.png → déjà prêts
  - splash-2732.png           → splash master (utilisé pour splash Android)
"""
import os
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ICONS_DIR = os.path.join(ROOT, "assets", "icons")
WWW_ICONS = os.path.join(ROOT, "www", "assets", "icons")
ANDROID_RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

src         = Image.open(os.path.join(ICONS_DIR, "icon-1024.png")).convert("RGBA")
maskable    = Image.open(os.path.join(ICONS_DIR, "icon-maskable-1024.png")).convert("RGBA")
transparent = Image.open(os.path.join(ICONS_DIR, "icon-transparent-2048.png")).convert("RGBA")
splash_master = Image.open(os.path.join(ICONS_DIR, "splash-2732.png")).convert("RGBA")

print(f"Source icon: {src.size}, maskable: {maskable.size}, splash: {splash_master.size}")

os.makedirs(WWW_ICONS, exist_ok=True)

# ── 1. PWA / web icons (depuis icon-1024) ──
pwa_sizes = [
    ("icon-192.png",  192),
    ("icon-180.png",  180),  # apple-touch
    ("icon-152.png",  152),
    ("icon-144.png",  144),
    ("icon-120.png",  120),
    ("icon-96.png",   96),
    ("icon-72.png",   72),
    ("icon-48.png",   48),
]
for name, size in pwa_sizes:
    img = src.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(ICONS_DIR, name), optimize=True)
    img.save(os.path.join(WWW_ICONS,  name), optimize=True)
    print(f"  ✓ PWA {name}")

# Copy already-prepared masters to www
for name in ["icon-1024.png", "icon-512.png",
             "icon-maskable-1024.png",
             "icon-transparent-2048.png",
             "favicon-16.png", "favicon-32.png",
             "splash-2732.png"]:
    src_path = os.path.join(ICONS_DIR, name)
    dst_path = os.path.join(WWW_ICONS, name)
    if os.path.exists(src_path):
        with open(src_path, "rb") as fr, open(dst_path, "wb") as fw:
            fw.write(fr.read())
        print(f"  ✓ copy {name}")

# Build a maskable-512 from the 1024 master
mask512 = maskable.resize((512, 512), Image.LANCZOS)
mask512.save(os.path.join(ICONS_DIR, "icon-maskable-512.png"), optimize=True)
mask512.save(os.path.join(WWW_ICONS,  "icon-maskable-512.png"), optimize=True)
print("  ✓ icon-maskable-512.png")

# ── 2. favicon.ico (multi-size) ──
ico_img = src.resize((48, 48), Image.LANCZOS)
for d in (ICONS_DIR, WWW_ICONS):
    ico_img.save(os.path.join(d, "favicon.ico"), format="ICO", sizes=[(16,16),(32,32),(48,48)])
print("  ✓ favicon.ico")

# ── 3. Android launcher (mipmap-*) ──
android_sizes = {
    "mipmap-mdpi":    48,
    "mipmap-hdpi":    72,
    "mipmap-xhdpi":   96,
    "mipmap-xxhdpi":  144,
    "mipmap-xxxhdpi": 192,
}
for folder, size in android_sizes.items():
    out = os.path.join(ANDROID_RES, folder)
    if not os.path.exists(out):
        continue
    # ic_launcher / ic_launcher_round → master icon
    img = src.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(out, "ic_launcher.png"), optimize=True)
    img.save(os.path.join(out, "ic_launcher_round.png"), optimize=True)
    # ic_launcher_foreground → MASKABLE (Android crop) à 1.5× pour safe zone
    fg_size = int(size * 1.5)
    fg = maskable.resize((fg_size, fg_size), Image.LANCZOS)
    fg.save(os.path.join(out, "ic_launcher_foreground.png"), optimize=True)
    print(f"  ✓ android {folder} ({size}px)")

# ── 4. Splash screens (port + land × 5 densités) ──
splash_sizes = {
    "drawable-port-mdpi":     (320, 480),
    "drawable-port-hdpi":     (480, 800),
    "drawable-port-xhdpi":    (720, 1280),
    "drawable-port-xxhdpi":   (960, 1600),
    "drawable-port-xxxhdpi":  (1280, 1920),
    "drawable-land-mdpi":     (480, 320),
    "drawable-land-hdpi":     (800, 480),
    "drawable-land-xhdpi":    (1280, 720),
    "drawable-land-xxhdpi":   (1600, 960),
    "drawable-land-xxxhdpi":  (1920, 1280),
}
# Use icon-transparent as logo on white background (splash-2732 is already centered)
for folder, (w, h) in splash_sizes.items():
    out = os.path.join(ANDROID_RES, folder)
    if not os.path.exists(out):
        continue
    canvas = Image.new("RGBA", (w, h), (255, 255, 255, 255))
    logo_size = int(min(w, h) * 0.45)
    logo = transparent.resize((logo_size, logo_size), Image.LANCZOS)
    canvas.paste(logo, ((w-logo_size)//2, (h-logo_size)//2), logo)
    canvas.save(os.path.join(out, "splash.png"), optimize=True)
    print(f"  ✓ splash {folder} ({w}x{h})")

print("\n✅ All icons generated from new masters.")
