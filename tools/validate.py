#!/usr/bin/env python3
"""Repository validation for Azkar TV Display.

Run from repository root:
    python3 tools/validate.py
"""
from __future__ import annotations

import glob
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIR = REPO_ROOT / "app" / "src" / "main" / "assets" / "content"
CONTENT_JSON = CONTENT_DIR / "content.json"
SECTIONS_JSON = CONTENT_DIR / "sections.json"

REQUIRED_ITEM_FIELDS = [
    "id",
    "section",
    "category",
    "type",
    "title",
    "arabic",
    "transliteration",
    "translation",
    "source",
    "verification",
]

ARABIC_DIACRITICS_RE = re.compile(r"[\u064B-\u065F\u0670\u06D6-\u06ED]")
WHITESPACE_RE = re.compile(r"\s+")


def error(message: str) -> None:
    print(f"::error::{message}")


def warning(message: str) -> None:
    print(f"::warning::{message}")


def load_json(path: Path) -> Any:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as exc:
        error(f"invalid JSON {path.relative_to(REPO_ROOT)}: {exc}")
        return None


def normalise_arabic(value: Any) -> str:
    text = str(value or "")
    text = ARABIC_DIACRITICS_RE.sub("", text)
    text = text.replace("ـ", "")
    text = WHITESPACE_RE.sub("", text)
    text = re.sub(r"[^\u0600-\u06FF]", "", text)
    return text


def validate_all_json_files() -> int:
    bad = 0
    json_files = sorted(Path(p) for p in glob.glob(str(CONTENT_DIR / "*.json")))
    if not json_files:
        error(f"no JSON files found under {CONTENT_DIR.relative_to(REPO_ROOT)}")
        return 1

    for path in json_files:
        if load_json(path) is None:
            bad = 1
    return bad


def validate_content_schema() -> int:
    bad = 0
    content = load_json(CONTENT_JSON)
    sections_data = load_json(SECTIONS_JSON)

    if not isinstance(content, dict):
        error("content.json must be a JSON object")
        return 1

    items = content.get("items")
    if not isinstance(items, list) or not items:
        error("content.json must contain a non-empty items array")
        return 1

    if content.get("total_items") != len(items):
        error(
            "content.json total_items mismatch: "
            f"declared {content.get('total_items')} but found {len(items)} items"
        )
        bad = 1

    ids: list[str] = []
    arabic_map: dict[str, dict[str, Any]] = {}
    section_counts: Counter[str] = Counter()
    verification_counts: Counter[str] = Counter()

    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            error(f"content.json item {index} must be an object")
            bad = 1
            continue

        item_id = str(item.get("id") or f"item_{index}")
        ids.append(item_id)
        section_counts[str(item.get("section") or "")] += 1

        for field in REQUIRED_ITEM_FIELDS:
            value = item.get(field)
            if value is None or str(value).strip() == "":
                error(f"missing required field '{field}' in item {index}: {item_id}")
                bad = 1

        normalised_arabic = normalise_arabic(item.get("arabic"))
        if normalised_arabic:
            previous = arabic_map.get(normalised_arabic)
            if previous:
                error(
                    "duplicate Arabic content found: "
                    f"{previous.get('id')} and {item_id}"
                )
                bad = 1
            else:
                arabic_map[normalised_arabic] = item

        verification = str(item.get("verification") or "").strip().lower()
        verification_counts[verification] += 1
        if verification in {"", "weak", "fabricated", "unknown"}:
            error(f"unacceptable verification value '{verification}' in item {item_id}")
            bad = 1

    duplicate_ids = [item_id for item_id, count in Counter(ids).items() if count > 1]
    for item_id in duplicate_ids:
        error(f"duplicate item id found: {item_id}")
        bad = 1

    if isinstance(sections_data, dict):
        sections = sections_data.get("sections", [])
        if isinstance(sections, list):
            for section in sections:
                if not isinstance(section, dict):
                    error("sections.json contains a section entry that is not an object")
                    bad = 1
                    continue
                key = str(section.get("key") or "")
                declared_count = section.get("count")
                actual_count = section_counts.get(key, 0)
                if declared_count != actual_count:
                    error(
                        "sections.json count mismatch for "
                        f"{key}: declared {declared_count}, found {actual_count}"
                    )
                    bad = 1
        else:
            error("sections.json must contain a sections array")
            bad = 1
    else:
        error("sections.json must be a JSON object")
        bad = 1

    if verification_counts:
        summary = ", ".join(
            f"{key or 'blank'}={value}"
            for key, value in sorted(verification_counts.items())
        )
        print(f"Verification status summary: {summary}")

    return bad


def main() -> int:
    bad = 0
    bad |= validate_all_json_files()
    bad |= validate_content_schema()

    if bad:
        error("Azkar TV Display validation failed")
        return 1

    print("Azkar TV Display validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
