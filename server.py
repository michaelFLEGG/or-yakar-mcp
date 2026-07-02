# -*- coding: utf-8 -*-
"""
Zohar sources search — remote MCP server.

Exposes full-text search tools over Kabbalistic reference works, so the
Claude-in-Word add-in can consult them while writing a פירוש:

  * search_or_yakar — the Ramak's "Or Yakar" commentary on the Zohar (page-anchored).
  * search_gra      — "Tikkunei ha-Zohar" with the Vilna Gaon's commentary
                      (anchored by Tikkun + daf; includes the Zohar text and the Gra's biur).

Add this server to Claude as a custom (remote MCP) connector.
Run:  python server.py   (listens on $PORT, default 8000, MCP at /mcp)
"""

import os
import re

from fastmcp import FastMCP

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# Text normalization
# ---------------------------------------------------------------------------
_BIDI = dict.fromkeys(
    [0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069],
    None,
)
_NIKUD_RE = re.compile("[֑-ׇ]")               # Hebrew points + cantillation (U+0591–05C7)
_GERESH_CHARS = "׳״\"'`"                        # geresh / gershayim / quotes
_GERESH_RE = re.compile("[" + re.escape(_GERESH_CHARS) + "]")


def clean(text: str) -> str:
    """Readable form: strip bidi controls and nikud, keep letters + geresh."""
    return _NIKUD_RE.sub("", text.translate(_BIDI))


def norm(text: str) -> str:
    """Match key: clean + drop geresh/gershayim/quotes, collapse whitespace."""
    return re.sub(r"\s+", " ", _GERESH_RE.sub("", clean(text))).strip()


def build_flex_regex(nquery: str):
    """Regex over CLEAN text tolerating geresh/gershayim/quotes and flexible whitespace."""
    parts = []
    for ch in nquery:
        parts.append(r"\s+" if ch == " " else re.escape(ch))
        parts.append("[" + re.escape(_GERESH_CHARS) + r"\s]*")
    return re.compile("".join(parts))


# ---------------------------------------------------------------------------
# Corpus: an index file parsed into labelled chunks, with search
# ---------------------------------------------------------------------------
class Corpus:
    def __init__(self, path, marker_re, label_fmt):
        """
        marker_re: compiled regex; group(1) is the marker's key (page number or location).
        label_fmt: callable(key_str) -> human label shown in results.
        """
        self.chunks = []  # list of (label, clean_text)
        cur_key = None
        buf = []
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.rstrip("\n")
                m = marker_re.match(line)
                if m:
                    if cur_key is not None:
                        self.chunks.append((label_fmt(cur_key), clean("\n".join(buf))))
                    cur_key = m.group(1)
                    buf = []
                else:
                    buf.append(line)
        if cur_key is not None:
            self.chunks.append((label_fmt(cur_key), clean("\n".join(buf))))

    def search(self, query, max_results, context_chars):
        nq = norm(query)
        if not nq:
            return "שאילתה ריקה — נא לספק מונח לחיפוש."
        rx = build_flex_regex(nq)
        hits = []
        for label, ctext in self.chunks:
            m = rx.search(ctext)
            if m:
                hits.append((label, ctext, m.span()))
        total = len(hits)
        if total == 0:
            return (f"לא נמצאו תוצאות עבור: '{query}'. (טיפ: הטקסט מנוקד ומלא ראשי-תיבות — "
                    f"נסה/י צורה ארמית או כתיב אחר, למשל 'שכינתא' במקום 'שכינה'.)")
        shown = hits[:max_results]
        out = [f"נמצאו {total} מקומות המכילים '{query}'. מוצגים {len(shown)}:", ""]
        for label, ctext, span in shown:
            out.append(f"--- {label} ---")
            out.append(_snippet(ctext, span, context_chars))
            out.append("")
        if total > max_results:
            out.append(f"…ועוד {total - max_results} מקומות. צמצם/י את המונח, או הגדל/י max_results.")
        return "\n".join(out).strip()


def _snippet(clean_text, span, context_chars):
    start, end = span
    a = max(0, start - context_chars)
    b = min(len(clean_text), end + context_chars)
    s = re.sub(r"\s+", " ", clean_text[a:b]).strip()
    if a > 0:
        s = "…" + s
    if b < len(clean_text):
        s = s + "…"
    return s


# ---------------------------------------------------------------------------
# Load corpora once at startup
# ---------------------------------------------------------------------------
OR_YAKAR = Corpus(
    os.path.join(HERE, "or_yakar_index.txt"),
    re.compile(r"^===PAGE (\d+)===$"),
    lambda k: f"עמוד {k} (PDF)",
)
GRA = Corpus(
    os.path.join(HERE, "gra_index.txt"),
    re.compile(r"^===SEC \d+ \| (.+)===$"),
    lambda k: k,  # location already human-readable, e.g. "תקונא תניינא · דף ג."
)


# ---------------------------------------------------------------------------
# MCP server + tools
# ---------------------------------------------------------------------------
mcp = FastMCP("Zohar sources search (אור יקר + גר\"א)")


@mcp.tool()
def search_or_yakar(query: str, max_results: int = 8, context_chars: int = 400) -> str:
    """
    חיפוש בטקסט המלא של "אור יקר" לרמ"ק — פירושו על הזוהר (~5,649 עמודים).
    מקבל מונח או ביטוי בעברית, ומחזיר את העמודים שבהם הוא מופיע, עם קטע-הקשר
    ומספר העמוד ב-PDF, כדי לסייע בכתיבת פירוש על הזוהר.

    Full-text search over the Ramak's "Or Yakar" commentary on the Zohar.
    Returns matching pages with a context snippet and the PDF page number.

    Args:
        query: Hebrew term or phrase (nikud/geresh optional).
        max_results: Max pages to return (default 8).
        context_chars: Characters of context on each side of the match (default 400).
    """
    return OR_YAKAR.search(query, max_results, context_chars)


@mcp.tool()
def search_gra(query: str, max_results: int = 8, context_chars: int = 400) -> str:
    """
    חיפוש ב"תיקוני הזהר" עם ביאור הגר"א (גירסת הגר"א) — כולל גם את לשון הזוהר
    המנוקדת וגם את ביאור הגר"א. מקבל מונח/ביטוי, ומחזיר את המקומות שבהם הוא
    מופיע, עם קטע-הקשר והמיקום (תיקון + דף), לסיוע בכתיבת פירוש.
    שורות שמסומנות ב-«זוהר» הן לשון הזוהר; השאר הוא ביאור הגר"א.

    Full-text search over "Tikkunei ha-Zohar" with the Vilna Gaon's (Gra) commentary,
    including both the vocalized Zohar text and the Gra's biur. Returns matching
    locations with a context snippet and the location (Tikkun + daf). Note: the text
    is vocalized and abbreviation-heavy — try Aramaic forms (e.g. "שכינתא", "אורייתא").

    Args:
        query: Hebrew/Aramaic term or phrase (nikud/geresh optional).
        max_results: Max locations to return (default 8).
        context_chars: Characters of context on each side of the match (default 400).
    """
    return GRA.search(query, max_results, context_chars)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    mcp.run(transport="http", host="0.0.0.0", port=port)
