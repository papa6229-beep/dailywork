import { Redis } from "@upstash/redis";

/* Vercel Marketplace에서 Upstash Redis를 연결하면
   KV_REST_API_URL / KV_REST_API_TOKEN 이 자동으로 들어옵니다.
   (경우에 따라 UPSTASH_ 접두사로 들어오기도 해서 둘 다 받습니다) */
const redis = new Redis({
  url:   process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = "banamall2:state";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  try {
    /* ── 읽기: 누구나 ── */
    if (req.method === "GET") {
      const data = await redis.get(KEY);
      return res.status(200).json(data || { plan: null, months: {}, updatedAt: null });
    }

    /* ── 쓰기: 비밀번호 필요 ── */
    if (req.method === "POST") {
      if (!process.env.EDIT_KEY) {
        return res.status(500).json({ error: "EDIT_KEY 환경변수가 아직 설정되지 않았습니다." });
      }
      if (req.headers["x-edit-key"] !== process.env.EDIT_KEY) {
        return res.status(401).json({ error: "입력 비밀번호가 맞지 않습니다." });
      }

      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== "object") {
        return res.status(400).json({ error: "저장할 내용이 비어 있습니다." });
      }

      const payload = {
        plan: body.plan || null,
        months: body.months || {},
        updatedAt: new Date().toISOString(),
      };
      await redis.set(KEY, payload);
      return res.status(200).json({ ok: true, updatedAt: payload.updatedAt });
    }

    return res.status(405).json({ error: "지원하지 않는 요청 방식입니다." });
  } catch (e) {
    return res.status(500).json({ error: "서버 오류: " + e.message });
  }
}
