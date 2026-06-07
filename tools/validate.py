#!/usr/bin/env python3
"""Release validation for Azkar TV Display — Version 01.

Validates JSON syntax, detects duplicate / missing Arabic content, checks
required fields and tajweed handling, and confirms the project structure.
Exits non-zero on any error so it can gate the CI build.
"""
import json, os, re, sys, unicodedata
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET = os.path.join(ROOT, "app", "src", "main", "assets")
CONTENT = os.path.join(ASSET, "content")

errors, warnings = [], []
def err(m): errors.append(m)
def warn(m): warnings.append(m)

HARAKAT = re.compile(r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF]')
NOISE = re.compile(r'[\s\u200c\u200d\.,؛،\-–—!؟\?\"\u201c\u201d\u2018\u2019:]')
def norm_ar(s):
    s = unicodedata.normalize('NFKC', s or '')
    return NOISE.sub('', HARAKAT.sub('', s))

REQUIRED_FILES = [
    "settings.gradle", "build.gradle", "gradle.properties", "gradlew", "gradlew.bat",
    "gradle/wrapper/gradle-wrapper.jar", "gradle/wrapper/gradle-wrapper.properties",
    "app/build.gradle",
    "app/src/main/AndroidManifest.xml",
    "app/src/main/java/com/ahmed/azkartv/MainActivity.kt",
    "app/src/main/assets/index.html",
    "app/src/main/assets/app.css",
    "app/src/main/assets/app.js",
    "app/src/main/assets/content/content.json",
    "app/src/main/assets/content/sections.json",
    "app/src/main/res/values/strings.xml",
    "app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml",
    ".github/workflows/build-apk.yml",
]
REQUIRED_FONTS = ["Amiri-Regular.ttf", "Amiri-Bold.ttf",
                  "ScheherazadeNew-Regular.ttf", "ScheherazadeNew-Bold.ttf", "ReemKufi.ttf"]

print("== Structure ==")
for rel in REQUIRED_FILES:
    if not os.path.exists(os.path.join(ROOT, rel)):
        err(f"missing required file: {rel}")
for f in REQUIRED_FONTS:
    if not os.path.exists(os.path.join(ASSET, "fonts", f)):
        err(f"missing font: {f}")

# No legacy revision branding allowed anywhere in source/text files.
print("== Branding (no legacy revision labels) ==")
BANNED = re.compile(r'\bRev0?\d{1,2}\b|2\.6-Rev', re.I)
TEXT_EXT = (".gradle", ".kt", ".java", ".xml", ".json", ".js", ".css", ".html", ".yml", ".md", ".properties")
for dp, _, fns in os.walk(ROOT):
    if "/.git" in dp or "/build" in dp or "/tools" in dp:
        continue
    for fn in fns:
        if fn.endswith(TEXT_EXT):
            p = os.path.join(dp, fn)
            try:
                txt = open(p, encoding="utf-8", errors="ignore").read()
            except Exception:
                continue
            if BANNED.search(txt):
                err(f"legacy revision label found in {os.path.relpath(p, ROOT)}")

print("== JSON syntax ==")
content = sections = None
try:
    content = json.load(open(os.path.join(CONTENT, "content.json"), encoding="utf-8"))
except Exception as e:
    err(f"content.json invalid JSON: {e}")
try:
    sections = json.load(open(os.path.join(CONTENT, "sections.json"), encoding="utf-8"))
except Exception as e:
    err(f"sections.json invalid JSON: {e}")

if content:
    items = content.get("items", [])
    print(f"   items: {len(items)}")
    if int(content.get("version_code", 0)) != 1:
        err("content.json version_code must be 1")
    if content.get("version_name") != "Version 01":
        err("content.json version_name must be 'Version 01'")

    print("== Per-item required fields ==")
    REQ = ["id", "section", "category", "type", "arabic", "transliteration",
           "translation", "source", "size_mode", "verification"]
    seen_norm = defaultdict(list)
    seen_id = set()
    sec_keys = {s["key"] for s in (sections or {}).get("sections", [])}
    for it in items:
        iid = it.get("id", "?")
        for k in REQ:
            if not str(it.get(k, "")).strip():
                err(f"[{iid}] missing field: {k}")
        if it.get("id") in seen_id:
            err(f"duplicate id: {it.get('id')}")
        seen_id.add(it.get("id"))
        if sec_keys and it.get("section") not in sec_keys:
            err(f"[{iid}] unknown section: {it.get('section')}")
        # tajweed must be null OR a non-empty string; never empty string
        tj = it.get("tajweed_html", None)
        if tj is not None and (not isinstance(tj, str) or not tj.strip()):
            err(f"[{iid}] tajweed_html must be null or non-empty markup")
        seen_norm[norm_ar(it.get("arabic", ""))].append(iid)

    print("== Duplicate Arabic ==")
    dups = {k: v for k, v in seen_norm.items() if k and len(v) > 1}
    if dups:
        for k, v in list(dups.items())[:10]:
            err(f"duplicate Arabic across items: {v}")
    else:
        print("   no duplicate Arabic content")

    print("== Section counts ==")
    bysec = defaultdict(int)
    for it in items:
        bysec[it.get("section")] += 1
    for s in (sections or {}).get("sections", []):
        actual = bysec.get(s["key"], 0)
        if actual != s.get("count"):
            warn(f"section count mismatch '{s['key']}': index={s.get('count')} actual={actual}")

print("\n== RESULT ==")
for w in warnings:
    print(f"  WARN: {w}")
if errors:
    for e in errors:
        print(f"  ERROR: {e}")
    print(f"\nFAILED with {len(errors)} error(s).")
    sys.exit(1)
print(f"PASSED ({len(warnings)} warning(s)).")
