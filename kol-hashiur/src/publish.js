/* ===== פרסום לספריית השיעורים של האתר (העלאה וקטלוג). פועל רק בגרסת האתר ===== */

const PUB_API = '/api/audio';
const SINGLE_MAX = 90 * 1024 * 1024;     /* מעל זה: העלאה בחלקים */
const PART_SIZE = 16 * 1024 * 1024;      /* חלקים שווים, כנדרש מהאחסון */
const TIMELINE_KEYS = ['speed', 'vinyl', 'silOn', 'silMin', 'silKeep', 'nr', 'hum', 'mono'];

function adminKeyGet() { try { return localStorage.getItem('zAdminKey') || localStorage.getItem('zeAdminKey') || ''; } catch (e) { return ''; } }
function adminKeySet(k) { try { if (k) { localStorage.setItem('zAdminKey', k); localStorage.setItem('zeAdminKey', k); } else { localStorage.removeItem('zAdminKey'); localStorage.removeItem('zeAdminKey'); } } catch (e) {} }

class PubError extends Error { constructor(msg, status, he) { super(msg); this.status = status; this.he = he; } }

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* העלאה בבקשה אחת עם התקדמות */
function uploadSingle(blob, key, adminKey, onProg, tok) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest();
    x.open('POST', PUB_API + '/upload?key=' + encodeURIComponent(key));
    x.setRequestHeader('x-admin-key', adminKey);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProg(e.loaded / e.total); };
    x.onload = () => {
      if (x.status === 200) return res();
      let he = ''; try { he = JSON.parse(x.responseText).he || ''; } catch (e) {}
      rej(new PubError('upload ' + x.status, x.status, he));
    };
    x.onerror = () => rej(new PubError('network', 0));
    x.onabort = () => rej(new Error('cancel'));
    if (tok) tok.abort = () => x.abort();
    x.send(blob);
  });
}

/* העלאה בחלקים, עם חידוש: state נשמר אצל הקורא ומאפשר המשך אחרי ניתוק */
async function uploadMulti(blob, key, adminKey, onProg, tok, state) {
  const H = { 'x-admin-key': adminKey };
  const post = async (qs, body, json) => {
    const r = await fetch(PUB_API + '/mp?' + qs, { method: 'POST', headers: H, body });
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok || !j || !j.ok) throw new PubError('mp ' + r.status, r.status, j && j.he);
    return j;
  };
  const kq = 'key=' + encodeURIComponent(key);
  if (!state.uploadId) { state.uploadId = (await post('act=start&' + kq)).uploadId; state.parts = []; }
  const total = Math.ceil(blob.size / PART_SIZE);
  for (let n = state.parts.length + 1; n <= total; n++) {
    if (tok && tok.cancel) throw new Error('cancel');
    const chunk = blob.slice((n - 1) * PART_SIZE, Math.min(blob.size, n * PART_SIZE));
    let ok = false, last;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      try {
        const j = await post('act=part&' + kq + '&uploadId=' + encodeURIComponent(state.uploadId) + '&n=' + n, chunk);
        state.parts.push({ n, etag: j.etag }); ok = true;
      } catch (e) { last = e; if (e.status === 403 || e.status === 503) throw e; await sleep(1500 * (attempt + 1)); }
    }
    if (!ok) throw last;
    onProg(n / total);
  }
  await post('act=done&' + kq + '&uploadId=' + encodeURIComponent(state.uploadId), JSON.stringify({ parts: state.parts }));
}

async function uploadAny(item, adminKey, onProg, tok) {
  if (item.blob.size <= SINGLE_MAX) await uploadSingle(item.blob, item.key, adminKey, onProg, tok);
  else { item.mp = item.mp || {}; await uploadMulti(item.blob, item.key, adminKey, onProg, tok, item.mp); }
  item.uploaded = true;
}

async function catalogPost(body, adminKey) {
  const r = await fetch(PUB_API + '/catalog', { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': adminKey }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok || !j || !j.ok) throw new PubError('catalog ' + r.status + ' ' + (j && j.error || ''), r.status);
  return j;
}

function newRecId() { return 'rec_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6); }
const EXT_OF = { mp3: 'mp3', opus: 'opus', wav: 'wav' };

/* הודעת שגיאה בעברית לפי הסטטוס */
function pubErrorText(e) {
  if (e && e.message === 'cancel') return 'הפרסום בוטל.';
  if (e && e.status === 403) return 'מפתח המנהל שגוי או שפג תוקפו. הזן אותו שוב ולחץ שוב על פרסום.';
  if (e && e.status === 503) return e.he || 'אחסון הקבצים באתר עדיין לא פעיל, ולכן אי אפשר להעלות.';
  if (e && e.status === 413) return 'הקובץ גדול מדי להעלאה. בחר חד-ערוצי או אופוס כדי להקטין אותו.';
  if (e && e.status === 0) return 'אין חיבור לאינטרנט. החיבור יחזור ואפשר ללחוץ שוב, ההעלאה תמשיך מהמקום שנעצר.';
  return 'הפרסום נכשל. נסה שוב, ואם זה חוזר, שמור את הקובץ בהורדה ופנה לתמיכה.';
}
