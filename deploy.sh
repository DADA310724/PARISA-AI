#!/bin/bash
# PARISA AI — Deploy Script
# ব্যবহার: bash deploy.sh "কমিট মেসেজ"
# যেমন: bash deploy.sh "TTS fix + screenshot update"

set -e

MSG=${1:-"chore: update"}

echo "🔄 Version bump করা হচ্ছে..."

# package.json থেকে বর্তমান version পড়ো
CURRENT=$(node -e "console.log(require('./package.json').version)")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
NEW_PATCH=$((PATCH + 1))
NEW_VER="$MAJOR.$MINOR.$NEW_PATCH"

# package.json আপডেট
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
p.version = '$NEW_VER';
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
console.log('✅ package.json version:', '$NEW_VER');
"

# public/index.html-এ Version badge আপডেট (Version-X ফরম্যাট)
# Minor number কে Version number হিসেবে ব্যবহার করো
VER_BADGE="Version-$MINOR"
sed -i "s/<span class=\"side-version\">Version-[0-9]*<\/span>/<span class=\"side-version\">$VER_BADGE<\/span>/g" public/index.html
echo "✅ Version badge: $VER_BADGE"

# Git commit + push
git add -A
git commit -m "v$NEW_VER: $MSG"
git push origin main

echo ""
echo "✅ Deploy সম্পন্ন!"
echo "   Version: $NEW_VER | Badge: $VER_BADGE"
echo "   Render এখন automatically deploy শুরু করবে।"
