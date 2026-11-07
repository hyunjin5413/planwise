import { analyzeSheet } from "@/lib/ai/analyze";
import { AiError } from "@/lib/ai/claude";

// 평면도 1장 기준 2분 이내가 목표지만, 대형 도면 타일 분석을 위해 여유를 둔다
export const maxDuration = 300;

const MAX_BYTES = 60 * 1024 * 1024;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "multipart/form-data로 이미지를 보내십시오.", code: "bad_request" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) return Response.json({ error: "file 필드가 없습니다.", code: "bad_request" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "파일이 60MB를 넘습니다.", code: "too_large" }, { status: 413 });
  const dpiRaw = form.get("dpi");
  const dpi = typeof dpiRaw === "string" && Number(dpiRaw) > 0 ? Number(dpiRaw) : null;
  try {
    const out = await analyzeSheet({ image: Buffer.from(await file.arrayBuffer()), dpi });
    return Response.json(out);
  } catch (e) {
    if (e instanceof AiError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
    console.error("analyze failed", e);
    const msg = e instanceof Error && /unsupported image format|Input buffer/i.test(e.message) ? "이미지를 읽지 못했습니다. PNG, JPG, TIFF 파일인지 확인하십시오." : "분석 중 오류가 발생했습니다.";
    return Response.json({ error: msg, code: "internal" }, { status: 500 });
  }
}
