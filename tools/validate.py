#!/usr/bin/env python3
import json
import glob
import sys
import re
from collections import defaultdict

bad = 0
arabic_seen = defaultdict(list)

json_files = glob.glob("app/src/main/assets/content/*.json")

if not json_files:
    print("::error::No JSON files found in app/src/main/assets/content/")
    sys.exit(1)

def normalize_arabic(text):
    if not isinstance(text, str):
        return ""
    text = re.sub(r"[\u064B-\u065F\u0670\u06D6-\u06ED]", "", text)
    text = text.replace("ـ", "")
    text = re.sub(r"\s+", "", text)
    return text.strip()

def scan_items(data, file_name):
    items = []

    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        if isinstance(data.get("items"), list):
            items = data.get("items")
        elif isinstance(data.get("data"), list):
            items = data.get("data")
        elif isinstance(data.get("azkar"), list):
            items = data.get("azkar")
        elif isinstance(data.get("duas"), list):
            items = data.get("duas")
        else:
            items = []

    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            continue

        arabic = item.get("arabic") or item.get("arabic_text") or item.get("text") or ""
        title = item.get("title") or item.get("name") or f"Item {index}"
        item_id = item.get("id") or f"{file_name}:{index}"

        normalized = normalize_arabic(arabic)

        if normalized:
            arabic_seen[normalized].append(f"{file_name} | {item_id} | {title}")

for file_path in json_files:
    try:
        with open(file_path, "r", encoding="utf-8") as file:
            data = json.load(file)

        scan_items(data, file_path)
        print(f"Checked JSON: {file_path}")

    except Exception as e:
        print(f"::error::Invalid JSON {file_path}: {e}")
        bad = 1

for arabic_text, matches in arabic_seen.items():
    if len(matches) > 1:
        print("::warning::Duplicate Arabic content detected")
        for match in matches:
            print(f"Duplicate item: {match}")

if bad:
    print("Validation failed.")
    sys.exit(1)

print("Validation completed successfully.")
sys.exit(0)
