// Discord 알림을 브라우저 대신 서버가 보낸다. 웹훅 주소는 Vercel 환경변수에만 두어
// 사이트 코드나 Firestore에 노출되지 않게 한다.
//   DISCORD_WEBHOOK_URL       기본 채널 (실적보고 · 긴급메모 · 메모요약)
//   DISCORD_RANK_WEBHOOK_URL  순위 채널 (없으면 기본 채널로 보냄 — 예전 동작과 같음)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  const { channel, content, username } = req.body || {};
  if (typeof content !== 'string' || !content.trim() || content.length > 2000) {
    return res.status(400).json({ ok: false, error: 'bad_content' });
  }
  const url = (channel === 'rank' && process.env.DISCORD_RANK_WEBHOOK_URL) || process.env.DISCORD_WEBHOOK_URL;
  if (!url) return res.status(503).json({ ok: false, error: 'not_configured' });
  try {
    const r = await fetch(url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // allowed_mentions: 메시지 안의 @everyone 같은 전체 호출이 실제로 울리지 않게 막는다.
      body: JSON.stringify({ content, allowed_mentions: { parse: [] }, ...(typeof username === 'string' && username ? { username: username.slice(0, 80) } : {}) }),
    });
    return res.status(r.ok ? 200 : 502).json({ ok: r.ok, ...(r.ok ? {} : { error: 'discord_' + r.status }) });
  } catch {
    return res.status(502).json({ ok: false, error: 'send_failed' });
  }
}
