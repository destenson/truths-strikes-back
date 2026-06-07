#!/usr/bin/env python3
"""Fetch the latest Trump Truth Social posts and write them to messages.json.

Reads the public feed at trumpstruth.org (Truth Social itself
serves no usable feed and blocks cross-origin reads). Runs server-side in CI
so the browser never makes a cross-origin request — the page just reads the
committed JSON same-origin.

Standard library only: no third-party dependencies to audit or pin.
"""

import html
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

FEED_URL = "https://trumpstruth.org/feed"
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "messages.json"
POST_COUNT = 120
REQUEST_TIMEOUT_SECONDS = 30
# trumpstruth.org returns the app shell instead of the feed to an empty
# User-Agent, so identify as a normal browser.
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) truths-strikes-back/1.0"


def fetch_feed(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return response.read()


def strip_html(raw):
    """Strip HTML tags and decode entities, returning plain text."""
    text = re.sub(r"<[^>]+>", " ", raw)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def parse_posts(feed_bytes, limit):
    root = ET.fromstring(feed_bytes)
    posts = []
    for item in root.iterfind("./channel/item"):
        title = (item.findtext("title") or "").strip()
        description_html = (item.findtext("description") or "").strip()
        description_text = strip_html(description_html)

        if title.startswith("[No Title]"):
            # The feed uses [No Title] as a placeholder when there's no text —
            # fall back to description. If that's also empty it's image/video
            # only and there's nothing worth showing in the crawl.
            text = description_text
        else:
            text = title or description_text

        if not text:
            continue

        posts.append(
            {
                "text": text,
                "url": (item.findtext("link") or "").strip(),
                "date": (item.findtext("pubDate") or "").strip(),
            }
        )
        if len(posts) >= limit:
            break
    return posts


def main():
    feed_bytes = fetch_feed(FEED_URL)
    posts = parse_posts(feed_bytes, POST_COUNT)
    if not posts:
        # Don't overwrite a good file with an empty one — fail loudly so CI
        # surfaces a broken feed instead of silently blanking the page.
        print("No posts parsed from feed; refusing to write empty file.", file=sys.stderr)
        return 1

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": FEED_URL,
        "posts": posts,
    }

    # Skip the write when only generated_at would change, so CI doesn't
    # produce a no-op commit on every run. Compare everything except the
    # timestamp.
    if OUTPUT_PATH.exists():
        try:
            existing = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            existing = None
        if existing is not None and {
            k: v for k, v in existing.items() if k != "generated_at"
        } == {k: v for k, v in payload.items() if k != "generated_at"}:
            print(f"No changes since last fetch; leaving {OUTPUT_PATH} untouched.")
            return 0

    OUTPUT_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(posts)} posts to {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
