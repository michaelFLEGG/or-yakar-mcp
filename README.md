# Or Yakar MCP — שרת חיפוש ל"אור יקר" (רמ״ק)

שרת MCP מרוחק שחושף כלי אחד, `search_or_yakar`, לחיפוש בטקסט המלא של
"אור יקר" לרמ״ק על הזוהר (~5,649 עמודים). מיועד להתחבר ל‑Claude כ‑**Custom Connector**,
כדי שהתוסף של Claude ב‑Word יוכל לחפש בו בזמן כתיבת פירוש.

## מבנה
- `server.py` — השרת (FastMCP, Streamable-HTTP, נקודת קצה `/mcp`).
- `or_yakar_index.txt` — האינדקס: טקסט מלא, כל עמוד מסומן `===PAGE n===` (n = עמוד ב‑PDF).
- `requirements.txt`, `render.yaml` — לפריסה.

## פריסה ל‑Render (חינם)
1. העלה את התיקייה הזו ל‑repo ב‑GitHub.
2. ב‑[render.com](https://render.com) → **New → Web Service** → חבר את ה‑repo.
   (או **New → Blueprint** אם רוצים להשתמש ב‑`render.yaml`.)
3. הגדרות (אם לא נטענו מ‑`render.yaml`):
   - Runtime: **Python**
   - Build: `pip install -r requirements.txt`
   - Start: `python server.py`
   - Plan: **Free**
4. Deploy. בסיום תקבל כתובת כמו `https://or-yakar-mcp.onrender.com`.
   נקודת ה‑MCP היא: **`https://or-yakar-mcp.onrender.com/mcp`**

## חיבור ל‑Claude (Custom Connector)
1. ב‑Claude: **Customize → Connectors** (או Settings → Connectors).
2. **+ → Add custom connector**.
3. הדבק את כתובת ה‑MCP: `https://<your-app>.onrender.com/mcp`
4. **Add**. (אין צורך ב‑OAuth.)

לאחר מכן הכלי `search_or_yakar` יהיה זמין גם בתוסף של Claude ב‑Word.

## שימוש
בתוך Word, בקש למשל: "כתוב פירוש על X — חפש קודם באור יקר מה הרמ״ק כותב."
Claude יקרא ל‑`search_or_yakar("X")`, יקבל את העמודים הרלוונטיים + מספרי עמוד ב‑PDF,
ויכתוב איתם.

## הערות
- תוכנית Free ב‑Render "נרדמת" אחרי חוסר פעילות; הקריאה הראשונה עשויה להתעכב ~30ש׳ (cold start).
- לרענון האינדקס: הפק מחדש מה‑PDF עם `pdftotext -enc UTF-8`, פצל לפי form-feed
  (`awk 'BEGIN{RS="\f"}{printf "===PAGE %d===\n%s\n",NR,$0}'`), החלף את `or_yakar_index.txt`, ופרוס מחדש.
