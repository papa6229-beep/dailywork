import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:   process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = "banamall2:state";
const PREV = "banamall2:state:prev";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    /* ── 읽기 ── */
    if (req.method === "GET") {
      if (req.query && req.query.prev === "1") {
        const prev = await redis.get(PREV);
        return res.status(200).json(prev || { plan: null, months: {}, updatedAt: null });
      }
      const data = await redis.get(KEY);
      return res.status(200).json(data || { plan: null, months: {}, updatedAt: null });
    }

    /* ── 쓰기 ── */
    if (req.method === "POST") {
      if (!process.env.EDIT_KEY) {
        return res.status(500).json({ error: "EDIT_KEY 환경변수가 설정되지 않았습니다. 버셀 Settings에서 추가한 뒤 재배포해 주세요." });
      }
      if (req.headers["x-edit-key"] !== process.env.EDIT_KEY) {
        return res.status(401).json({ error: "입력 비밀번호가 맞지 않습니다." });
      }

      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); }
        catch { return res.status(400).json({ error: "보낸 내용을 읽지 못했습니다." }); }
      }
      if (!body || typeof body !== "object" || !body.plan) {
        return res.status(400).json({ error: "저장할 내용이 비어 있습니다. 저장을 중단했습니다." });
      }

      const payload = {
        plan: body.plan,
        months: body.months || {},
        updatedAt: new Date().toISOString(),
      };

      const size = Buffer.byteLength(JSON.stringify(payload));
      if (size > 900000) {
        return res.status(413).json({ error: "내용이 너무 큽니다 (" + Math.round(size/1024) + "KB). 오래된 기록을 정리해 주세요." });
      }

      /* 직전 값을 한 세대 보관해 두고 덮어쓴다 */
      try {
        const before = await redis.get(KEY);
        if (before) await redis.set(PREV, before);
      } catch (e) { /* 보관 실패는 저장을 막지 않는다 */ }

      await redis.set(KEY, payload);
      return res.status(200).json({ ok: true, updatedAt: payload.updatedAt, size });
    }

    return res.status(405).json({ error: "지원하지 않는 요청 방식입니다." });

  } catch (e) {
    const msg = (e && (e.message || e.toString())) || "알 수 없는 오류";
    return res.status(502).json({
      error: "저장소 연결에 실패했습니다. 잠시 후 자동으로 다시 시도합니다.",
      detail: String(msg).slice(0, 300)
    });
  }
}
