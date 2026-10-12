// זורע ספריית בדיקה בשרת המקומי: שני שיעורים בסדרה, גרסה נוספת, פרקים ומפת שתיקות
import fs from 'node:fs';
const base = process.argv[2] || 'http://127.0.0.1:8766';
const mp3 = fs.readFileSync(process.argv[3]);
const H = { 'x-admin-key': 'SECRET' };
const up = async (key, body) => { const r = await fetch(base + '/api/audio/upload?key=' + key, { method: 'POST', headers: H, body }); if (!r.ok) throw new Error('upload ' + r.status); };
const add = async (rec) => { const r = await fetch(base + '/api/audio/catalog', { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ act: 'add', rec }) }); const j = await r.json(); if (!j.ok) throw new Error(JSON.stringify(j)); };
await up('recordings/rec_t1abc.mp3', mp3); await up('recordings/rec_t1abc_v2.mp3', mp3); await up('recordings/rec_t2abc.mp3', mp3);
await up('timings/rec_t1abc.sil.json', JSON.stringify({ v: 1, sil: [5, 8, 13, 16, 21, 24] }));
await add({ id: 'rec_t1abc', file: 'recordings/rec_t1abc.mp3', size: mp3.length, dur: 40, title: 'שיעור ראשון בסדרה', series: 'סדרת בדיקה', seriesNo: 1, pkey: 'Bereshit', reader: 'הרב בדיקה',
  variants: [{ label: 'לנהיגה', file: 'recordings/rec_t1abc_v2.mp3', size: mp3.length }], chapters: [{ t: 0, n: 'פתיחה' }, { t: 12, n: 'עיקר הדברים' }, { t: 30, n: 'סיכום' }], silf: 'timings/rec_t1abc.sil.json' });
await add({ id: 'rec_t2abc', file: 'recordings/rec_t2abc.mp3', size: mp3.length, dur: 40, title: 'שיעור שני בסדרה', series: 'סדרת בדיקה', seriesNo: 2, pkey: 'Noach', reader: 'הרב בדיקה' });
await add({ id: 'rec_hid1x', file: 'recordings/rec_t2abc.mp3', title: 'טיוטה מוסתרת', hidden: true });
console.log('seeded');
