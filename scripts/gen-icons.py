"""Génère toutes les déclinaisons d'icônes depuis logo-djamikshop.png (1024x1024)."""
import os
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC  = os.path.join(ROOT, "assets", "icons", "logo-djamikshop.png")
ICONS_DIR = os.path.join(ROOT, "assets", "icons")
WWW_ICONS = os.path.join(ROOT, "www", "assets", "icons")
ANDROID_RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

src = Image.open(SRC).convert("RGBA")
print(f"Source: {src.size}")

# ── PWA / web icons ──
pwa_sizes = [
    ("icon-1024.png", 1024),
    ("icon-512.png",  512),
    ("icon-192.png",  192),
    ("icon-180.png",  180),  # apple-touch
    ("icon-152.png",  152),
    ("icon-144.png",  144),
    ("icon-120.png",  120),
    ("icon-96.png",   96),
    ("icon-72.png",   72),
    ("icon-48.png",   48),
    ("favicon-32.png", 32),
    ("favicon-16.png", 16),
]
os.makedirs(ICONS_DIR, exist_ok=True)
os.makedirs(WWW_ICONS, exist_ok=True)
for name, size in pwa_sizes:
    img = src.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(ICONS_DIR, name), optimize=True)
    img.save(os.path.join(WWW_ICONS,  name), optimize=True)
    print(f"  ✓ {name}")

# ── favicon.ico (multi-size) ──
ico_sizes = [(16,16),(32,32),(48,48)]
ico_img = src.resize((48,48), Image.LANCZOS)
ico_path1 = os.path.join(ICONS_DIR, "favicon.ico")
ico_path2 = os.path.join(WWW_ICONS, "favicon.ico")
ico_img.save(ico_path1, format="ICO", sizes=ico_sizes)
ico_img.save(ico_path2, format="ICO", sizes=ico_sizes)
print("  ✓ favicon.ico")

# ── Maskable icon (padding 20% pour safe zone) ──
# Android découpe l'icône → on doit avoir 80% safe zone au centre
mask_size = 1024
safe = int(mask_size * 0.72)  # logo occupe 72% (un peu plus serré pour pas perdre les détails)
canvas = Image.new("RGBA", (mask_size, mask_size), (232, 80, 26, 255))  # fond orange brand
logo = src.resize((safe, safe), Image.LANCZOS)
pos = ((mask_size - safe)//2, (mask_size - safe)//2)
canvas.paste(logo, pos, logo)
mask_path1 = os.path.join(ICONS_DIR, "icon-maskable-1024.png")
mask_path2 = os.path.join(WWW_ICONS, "icon-maskable-1024.png")
canvas.save(mask_path1, optimize=True)
canvas.save(mask_path2, optimize=True)
# version 512
canvas512 = canvas.resize((512,512), Image.LANCZOS)
canvas512.save(os.path.join(ICONS_DIR, "icon-maskable-512.png"), optimize=True)
canvas512.save(os.path.join(WWW_ICONS,  "icon-maskable-512.png"), optimize=True)
print("  ✓ icon-maskable (1024+512)")

# ── Android launcher icons ──
# Densités Android : mdpi=48, hdpi=72, xhdpi=96, xxhdpi=144, xxxhdpi=192
android_sizes = {
    "mipmap-mdpi":    48,
    "mipmap-hdpi":    72,
    "mipmap-xhdpi":   96,
    "mipmap-xxhdpi":  144,
    "mipmap-xxxhdpi": 192,
}
for folder, size in android_sizes.items():
    out = os.path.join(ANDROID_RES, folder)
    if not os.path.exists(out): continue
    img = src.resize((size, size), Image.LANCZOS)
    img.save(os.path.join(out, "ic_launcher.png"), optimize=True)
    img.save(os.path.join(out, "ic_launcher_round.png"), optimize=True)
    # Foreground = logo agrandi (108dp safe area, 72dp visible)
    fg_size = int(size * 1.5)
    fg = Image.new("RGBA", (fg_size, fg_size), (0,0,0,0))
    inner = int(fg_size * 0.66)
    logo_fg = src.resize((inner, inner), Image.LANCZOS)
    fg.paste(logo_fg, ((fg_size-inner)//2, (fg_size-inner)//2), logo_fg)
    fg.save(os.path.join(out, "ic_launcher_foreground.png"), optimize=True)
    print(f"  ✓ android {folder} ({size}px)")

# ── Splash screen (port + land, plusieurs densités) ──
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
for folder, (w, h) in splash_sizes.items():
    out = os.path.join(ANDROID_RES, folder)
    if not os.path.exists(out): continue
    splash = Image.new("RGBA", (w, h), (255,255,255,255))
    logo_size = int(min(w, h) * 0.4)
    logo_resized = src.resize((logo_size, logo_size), Image.LANCZOS)
    splash.paste(logo_resized, ((w-logo_size)//2, (h-logo_size)//2), logo_resized)
    splash.save(os.path.join(out, "splash.png"), optimize=True)
    print(f"  ✓ splash {folder} ({w}x{h})")

print("\n✅ All icons generated.")
