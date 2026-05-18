#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  DjamikShop — Script de mise à jour automatique
#
#  Usage :
#    ./update.sh "message de commit"
#    ./update.sh "message de commit" --apk      # + rebuild APK sur tel
#    ./update.sh "message de commit" --no-push  # commit local seulement
#
#  Ce que ça fait :
#    1. Bump sw.js VERSION (v1.X.X → v1.X.X+1)
#    2. Sync assets/ + pages/ + sw.js + manifest vers www/
#    3. npx cap sync android
#    4. git add + commit + push
#    5. (Optionnel) Rebuild APK + install sur tel branché
# ═══════════════════════════════════════════════════════════════════

set -e  # Stop on error

# ── Couleurs ──
G='\033[0;32m'  # vert
Y='\033[1;33m'  # jaune
R='\033[0;31m'  # rouge
B='\033[0;34m'  # bleu
N='\033[0m'     # reset

# ── Vérifs ──
if [ -z "$1" ]; then
  echo -e "${R}❌ Erreur : message de commit requis${N}"
  echo ""
  echo "Usage :"
  echo "  ./update.sh \"description du changement\""
  echo "  ./update.sh \"description du changement\" --apk      # + rebuild APK"
  echo "  ./update.sh \"description du changement\" --no-push  # local seulement"
  exit 1
fi

MSG="$1"
BUILD_APK=false
PUSH=true

for arg in "$@"; do
  if [ "$arg" = "--apk" ]; then BUILD_APK=true; fi
  if [ "$arg" = "--no-push" ]; then PUSH=false; fi
done

cd "$(dirname "$0")"

# ── 1. Bump sw.js VERSION ──
echo -e "${B}▶ Étape 1/5 : Bump sw.js VERSION${N}"
CURRENT=$(grep -oE "djamik-v[0-9]+\.[0-9]+\.[0-9]+" sw.js | head -1)
if [ -z "$CURRENT" ]; then
  echo -e "${R}❌ Impossible de trouver la VERSION dans sw.js${N}"
  exit 1
fi

# Parse v1.2.5 → 1 2 5
MAJOR=$(echo "$CURRENT" | sed -E 's/djamik-v([0-9]+)\.([0-9]+)\.([0-9]+)/\1/')
MINOR=$(echo "$CURRENT" | sed -E 's/djamik-v([0-9]+)\.([0-9]+)\.([0-9]+)/\2/')
PATCH=$(echo "$CURRENT" | sed -E 's/djamik-v([0-9]+)\.([0-9]+)\.([0-9]+)/\3/')
NEW_PATCH=$((PATCH + 1))
NEW="djamik-v${MAJOR}.${MINOR}.${NEW_PATCH}"
NEW_LABEL="v${MAJOR}.${MINOR}.${NEW_PATCH}"

# Utilise sed compatible Windows (Git Bash)
sed -i "s/$CURRENT/$NEW/g" sw.js
echo -e "  ${G}✓ $CURRENT → $NEW${N}"

# ── 2. Sync vers www/ ──
echo -e "${B}▶ Étape 2/5 : Sync vers www/${N}"
cp sw.js www/sw.js
cp manifest.webmanifest www/manifest.webmanifest
cp -r assets/css/. www/assets/css/
cp -r assets/js/. www/assets/js/
cp -r assets/icons/. www/assets/icons/
cp -r pages/. www/pages/
echo -e "  ${G}✓ assets + pages + sw.js + manifest copiés${N}"

# ── 3. Capacitor sync ──
echo -e "${B}▶ Étape 3/5 : npx cap sync android${N}"
npx cap sync android 2>&1 | grep -E "(✓|error|warning)" | tail -5 || true
echo -e "  ${G}✓ Capacitor sync terminé${N}"

# ── 4. Git commit + push ──
echo -e "${B}▶ Étape 4/5 : Git commit${N}"
git add -A

# Détecte s'il y a des changements
if git diff --cached --quiet; then
  echo -e "  ${Y}⚠ Aucun changement à commiter${N}"
else
  git commit -m "$NEW_LABEL - $MSG" > /dev/null
  echo -e "  ${G}✓ Commit créé : $NEW_LABEL - $MSG${N}"

  if [ "$PUSH" = true ]; then
    echo -e "${B}▶ Push vers GitHub${N}"
    git push 2>&1 | tail -2
    echo -e "  ${G}✓ Push terminé — Vercel va déployer dans ~1 min${N}"
  else
    echo -e "  ${Y}⚠ Push ignoré (--no-push)${N}"
  fi
fi

# ── 5. (Optionnel) Build APK ──
if [ "$BUILD_APK" = true ]; then
  echo -e "${B}▶ Étape 5/5 : Build + install APK${N}"

  # Check device
  DEVICES=$($LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe devices 2>/dev/null | grep -v "List of devices" | grep -c "device$" || echo "0")
  if [ "$DEVICES" = "0" ]; then
    echo -e "  ${R}❌ Aucun téléphone Android détecté en USB${N}"
    echo "  Branche ton tel + active le débogage USB, puis :"
    echo "  cd android && JAVA_HOME=\"/c/Program Files/Android/Android Studio/jbr\" ./gradlew.bat installDebug"
    exit 0
  fi

  cd android
  JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew.bat installDebug 2>&1 | tail -5
  cd ..
  echo -e "  ${G}✓ APK installée sur ton téléphone${N}"
else
  echo -e "${B}▶ Étape 5/5 : APK skipped${N}"
  echo -e "  ${Y}ℹ Pour rebuild l'APK aussi, relance avec : ./update.sh \"$MSG\" --apk${N}"
fi

echo ""
echo -e "${G}═══════════════════════════════════════════════════════════════════${N}"
echo -e "${G}✅ Mise à jour $NEW_LABEL terminée !${N}"
echo -e "${G}═══════════════════════════════════════════════════════════════════${N}"
if [ "$PUSH" = true ]; then
  echo -e "🌐 Site web : ${B}https://djamikshop-v5.vercel.app${N} (live dans ~1 min)"
fi
if [ "$BUILD_APK" = true ]; then
  echo -e "📱 APK : installée sur ton tel — ouvre l'app pour voir les changements"
fi
