# -*- coding: utf-8 -*-
"""
Or Yakar Search — remote MCP server.

Exposes a single tool, `search_or_yakar`, that full-text-searches the Ramak's
'Or Yakar' commentary on the Zohar (~5,649 pages) and returns matching pages
with a context snippet and the PDF page number.

Designed to be added to Claude as a custom (remote MCP) connector, so the
Claude-in-Word add-in can call it while writing a פירוש.

Run:  python server.py         (listens on $PORT, default 8000, at /mcp)
"""

import os
import re

from fastmcp import FastMCP

INDEX_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "or_yakar_index.txt")

# ---------------------------------------------------------------------------
# Text normalization
# ---------------------------------------------------------------------------
# Bidi control chars that pdftotext wraps each line in (RLE/PDF/etc.)
_BIDI = dict.fromkeys(
    [0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069],
    None,
)
# Hebrew points + cantillation (nikud/te'amim). The letters block starts at 05D0,
# so removing 0591–05C7 is safe and never touches letters.
_NIKUD_RE = re.compile("[֑-ׇ]")
# geresh / gershayim / ascii quotes — dropped so abbreviations match regardless of style
_GERESH_CHARS = "׳״\"'`"
_GERESH_RE = re.compile("[" + re.escape(_GERESH_CHARS) + "]")


def clean(text: str) -> str:
    """Readable form: strip bidi controls and nikud, keep letters + geresh."""
    return _NIKUD_RE.sub("", text.translate(_BIDI))


def norm(text: str) -> str:
    """Match key: clean + drop geresh/gershayim/quotes, collapse whitespace."""
    return re.sub(r"\s+", " ", _GERESH_RE.sub("", clean(text))).strip()


def build_flex_regex(nquery: str):
    """
    Regex over CLEAN text that tolerates geresh/gershayim/quotes between letters
    and flexible whitespace, so a normalized query still matches the readable text.
    """
    parts = []
    for ch in nquery:
        parts.append(r"\s+" if ch == " " else re.escape(ch))
        parts.append("[" + re.escape(_GERESH_CHARS) + r"\s]*")
    return re.compile("".join(parts))


# ---------------------------------------------------------------------------
# Load & parse the index once at startup
# ---------------------------------------------------------------------------
_PAGE_RE = re.compile(r"^===PAGE (\d+)===$")


def load_pages(path):
    """Return list of (page_number, clean_text)."""
    pages = []
    cur_num = None
    buf = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.rstrip("\n")
            m = _PAGE_RE.match(line)
            if m:
                if cur_num is not None:
                    pages.append((cur_num, clean("\n".join(buf))))
                cur_num = int(m.group(1))
                buf = []
            else:
                buf.append(line)
    if cur_num is not None:
        pages.append((cur_num, clean("\n".join(buf))))
    return pages


PAGES = load_pages(INDEX_PATH)  # [(num, clean_text), ...]


def _snippet(clean_text: str, span, context_chars: int) -> str:
    start, end = span
    a = max(0, start - context_chars)
    b = min(len(clean_text), end + context_chars)
    s = clean_text[a:b].strip()
    s = re.sub(r"\s+", " ", s)
    if a > 0:
        s = "…" + s
    if b < len(clean_text):
        s = s + "…"
    return s


# ---------------------------------------------------------------------------
# MCP server
# ---------------------------------------------------------------------------
mcp = FastMCP("Or Yakar Search (אור יקר)")


@mcp.tool()
def search_or_yakar(query: str, max_results: int = 8, context_chars: int = 400) -> str:
    """
    חיפוש בטקסט המלא של "אור יקר" לרמ"ק — פירושו על הזוהר (~5,649 עמודים).
    מקבל מונח או ביטוי בעברית, ומחזיר את העמודים שבהם הוא מופיע, עם קטע-הקשר
    ומספר העמוד ב-PDF, כדי לסייע בכתיבת פירוש על הזוהר.

    Full-text search over the Ramak's "Or Yakar" commentary on the Zohar.
    Give a Hebrew term or phrase; returns the pages where it appears, each with a
    context snippet and the PDF page number. Use it before writing a פירוש to
    check whether the Ramak addresses the topic and to quote his words.

    Args:
        query: Hebrew term or phrase to search for (nikud/geresh optional).
        max_results: Max pages to return (default 8).
        context_chars: Characters of context on each side of the match (default 400).
    """
    nq = norm(query)
    if not nq:
        return "שאילתה ריקה — נא לספק מונח לחיפוש."

    rx = build_flex_regex(nq)
    hits = []
    for num, ctext in PAGES:
        m = rx.search(ctext)
        if m:
            hits.append((num, ctext, m.span()))

    total = len(hits)
    if total == 0:
        return f"לא נמצאו תוצאות עבור: '{query}'."

    shown = hits[:max_results]
    out = [f"נמצאו {total} עמודים המכילים '{query}'. מוצגים {len(shown)}:", ""]
    for num, ctext, span in shown:
        out.append(f"--- עמוד {num} (PDF) ---")
        out.append(_snippet(ctext, span, context_chars))
        out.append("")
    if total > max_results:
        out.append(f"…ועוד {total - max_results} עמודים. צמצם/י את המונח, או הגדל/י max_results.")
    return "\n".join(out).strip()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    # Streamable-HTTP transport; MCP endpoint served at /mcp
    mcp.run(transport="http", host="0.0.0.0", port=port)
