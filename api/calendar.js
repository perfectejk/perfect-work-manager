// 교육 일정 구독 주소 (iCal). 네이버 캘린더·아이폰 캘린더에서 "구독"하면 위젯에 교육 회차가 뜬다.
//   전체 일정:     /api/calendar?t=<CAL_SECRET 값>
//   한 사람 일정:  /api/calendar?p=<이름>&t=<그 사람 열쇠>   — 대상자이거나 참석한 회차만
//   주소 목록:     /api/calendar?links=1&t=<CAL_SECRET 값>   — 사람별 구독 주소를 한눈에 보는 페이지
// 사람별 열쇠는 Vercel 환경변수 CAL_SECRET 과 이름으로 만든다(사람마다 다르고, 다른 사람 것을 짐작할 수 없음). 회차의 제목·날짜·시간만 내보내고
// 참석 여부·이해도·메모 같은 기록은 내보내지 않는다.
import crypto from 'node:crypto';

const FS = 'https://firestore.googleapis.com/v1/projects/perfect-work-manager/databases/(default)/documents/kv/';
const ALL = '*';

async function kv(id) {
  const r = await fetch(FS + encodeURIComponent(id));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('firestore_' + r.status);
  const j = await r.json();
  const v = j.fields && j.fields.v && j.fields.v.stringValue;
  return v ? JSON.parse(v) : null;
}

const sign = (secret, who) => crypto.createHmac('sha256', secret).update('cal:' + who).digest('base64url').slice(0, 24);
const same = (a, b) => typeof a === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// 회차 제목 — 앱(recur.js sessionTitle)과 같은 규칙
function titleOf(s, prog, round) {
  const t = (s.title || '').trim();
  if (t) return t;
  const name = (prog && prog.name) || '교육';
  if (prog && prog.kind === 'set' && s.set) {
    const st = (prog.steps || [])[s.step] || {};
    return `${name} - ${s.set}세트 ${st.n || ''}${s.retake ? ' (재교육)' : ''}`.trim();
  }
  if (prog && prog.rule === 'once' && round === 1) return name;
  return `${name} - ${round}회차`;
}

// iCal 글자 처리
const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line) {   // 한 줄 75바이트 넘으면 접기 (한글이 깨지지 않게 글자 단위로)
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const pad = (n) => String(n).padStart(2, '0');
// 한국 시간(UTC+9, 서머타임 없음) → UTC 표기
function utcStamp(date, time, addMin = 0) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, hh - 9, mm + addMin));
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00Z`;
}
const dayStamp = (date, add = 0) => {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + add));
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}`;
};

export default async function handler(req, res) {
  const secret = process.env.CAL_SECRET;
  if (!secret) return res.status(503).send('not_configured');
  const q = req.query || {};
  const who = typeof q.p === 'string' && q.p.trim() ? q.p.trim() : ALL;
  // 전체 일정·주소 목록은 CAL_SECRET 값 그대로가 열쇠, 사람별은 그 사람 이름으로 만든 열쇠
  if (!same(q.t, who === ALL ? secret : sign(secret, who))) return res.status(403).send('forbidden');

  let programs, sessions = [];
  try {
    programs = (await kv('wm--programs')) || [];
    const chunks = await Promise.all(programs.map((p) => kv('wm--sessions--' + p.id).catch(() => null)));
    chunks.forEach((c) => { if (Array.isArray(c)) sessions.push(...c); });
  } catch {
    return res.status(502).send('load_failed');
  }
  const progOf = (pid) => programs.find((p) => String(p.id) === String(pid));

  // 사람별 주소 목록 페이지 (전체 열쇠로만)
  if (q.links && who === ALL) {
    const people = new Set(programs.flatMap((p) => p.members || []));
    sessions.forEach((s) => Object.entries(s.attend || {}).forEach(([n, v]) => { if (v) people.add(n); }));
    const host = `https://${req.headers.host}`;
    const link = (p) => `${host}/api/calendar?${p === ALL ? 't=' + encodeURIComponent(secret) : 'p=' + encodeURIComponent(p) + '&t=' + sign(secret, p)}`;
    const row = (label, p) => `<tr><td>${label}</td><td><input readonly value="${link(p)}" onclick="this.select()"></td></tr>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>교육 일정 구독 주소</title>
<style>body{font-family:-apple-system,'Pretendard',sans-serif;padding:16px;max-width:760px;margin:auto;color:#222}td{padding:6px 4px;font-size:14px;white-space:nowrap}input{width:100%;min-width:320px;font-size:12px;padding:6px}p{color:#666;font-size:13px;line-height:1.6}</style>
<h2>교육 일정 구독 주소</h2><p>주소를 눌러 복사한 뒤 네이버 캘린더(캘린더 구독) 또는 아이폰 설정 → 캘린더 → 계정 → 구독 캘린더 추가에 붙여 넣으세요.<br>사람별 주소에는 그 사람이 대상자이거나 참석한 회차만 나옵니다. 주소를 아는 사람은 일정을 볼 수 있으니 본인에게만 전달하세요.</p>
<table>${row('<b>전체 (관리자)</b>', ALL)}${[...people].sort((a, b) => a.localeCompare(b, 'ko')).map((p) => row(p, p)).join('')}</table>`);
  }

  // 회차 번호 — 취소 회차는 세지 않는다 (앱과 같은 규칙)
  const live = sessions.filter((s) => s.status !== 'skip' && s.date);
  const roundOf = (s) => {
    const list = live.filter((x) => String(x.pid) === String(s.pid)).sort((a, b) => a.date.localeCompare(b.date));
    return list.findIndex((x) => x.id === s.id) + 1;
  };
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);   // 지난 90일 + 앞으로 전부
  const mine = live.filter((s) => {
    if (s.date < since) return false;
    if (who === ALL) return true;
    const pg = progOf(s.pid);
    return ((pg && pg.members) || []).includes(who) || !!(s.attend || {})[who];
  });

  const now = utcStamp(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16));
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//perfect-work-manager//edu//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + esc(who === ALL ? '교육 일정' : `교육 일정 · ${who}`), 'X-WR-TIMEZONE:Asia/Seoul',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];
  mine.forEach((s) => {
    const pg = progOf(s.pid);
    const hasTime = /^\d{1,2}:\d{2}$/.test(s.time || '');
    lines.push('BEGIN:VEVENT', `UID:${s.id}@perfect-work-manager`, `DTSTAMP:${now}`);
    if (hasTime) lines.push(`DTSTART:${utcStamp(s.date, s.time)}`, `DTEND:${utcStamp(s.date, s.time, 60)}`);
    else lines.push(`DTSTART;VALUE=DATE:${dayStamp(s.date)}`, `DTEND;VALUE=DATE:${dayStamp(s.date, 1)}`);
    lines.push('SUMMARY:' + esc(titleOf(s, pg, roundOf(s))));
    lines.push('DESCRIPTION:' + esc(`${(pg && pg.name) || ''}${s.status === 'done' ? ' · 완료' : ''}`));
    if (s.place) lines.push('LOCATION:' + esc(s.place));
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.send(lines.map(fold).join('\r\n') + '\r\n');
}
