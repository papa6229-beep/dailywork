import { put, get } from "@vercel/blob";

export const maxDuration = 25;

const PATH = "banamall2/state.json";

function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(label + " 응답 없음 (" + ms + "ms)")), ms)),
  ]);
}

async function readState() {
  /* useCache:false → 방금 저장한 내용이 바로 반영된다 */
  const r = await withTimeout(get(PATH, { access: "private", useCache: false }), 9000, "읽기");
  if (!r || !r.stream) return null;
  const text = await new Response(r.stream).text();
  return JSON.parse(text);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ error: "저장소가 연결되지 않았습니다. Storage에서 Blob을 이 프로젝트에 Connect한 뒤 재배포해 주세요." });
  }

  try {
    if (req.method === "GET") {
      const data = await readState();
      return res.status(200).json(data || { plan: null, months: {}, updatedAt: null });
    }

    if (req.method === "POST") {
      if (!process.env.EDIT_KEY) {
        return res.status(500).json({ error: "EDIT_KEY 환경변수가 없습니다." });
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
        return res.status(400).json({ error: "내용이 비어 있어 저장하지 않았습니다." });
      }

      const payload = {
        plan: body.plan,
        months: body.months || {},
        updatedAt: new Date().toISOString(),
      };
      const text = JSON.stringify(payload);
      if (Buffer.byteLength(text) > 900000) {
        return res.status(413).json({ error: "내용이 너무 큽니다." });
      }

      await withTimeout(put(PATH, text, {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      }), 12000, "저장");

      return res.status(200).json({ ok: true, updatedAt: payload.updatedAt });
    }

    return res.status(405).json({ error: "지원하지 않는 요청 방식입니다." });

  } catch (e) {
    const msg = String((e && (e.message || e)) || "알 수 없는 오류");
    return res.status(msg.includes("응답 없음") ? 504 : 502).json({
      error: "저장소 처리에 실패했습니다.",
      detail: msg.slice(0, 300),
    });
  }
}
