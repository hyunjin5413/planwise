import { AiError } from "@/lib/ai/claude";
import { refineGuide, type GuideRequest } from "@/lib/ai/guide";

export const maxDuration = 60;

export async function POST(request: Request) {
  let body: GuideRequest;
  try {
    body = (await request.json()) as GuideRequest;
  } catch {
    return Response.json({ error: "JSON 본문이 필요합니다.", code: "bad_request" }, { status: 400 });
  }
  if (!body?.templateGuide || !body?.citation) {
    return Response.json({ error: "templateGuide와 citation이 필요합니다.", code: "bad_request" }, { status: 400 });
  }
  try {
    return Response.json(await refineGuide(body));
  } catch (e) {
    if (e instanceof AiError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
    console.error("guide failed", e);
    return Response.json({ error: "가이드 생성 중 오류가 발생했습니다.", code: "internal" }, { status: 500 });
  }
}
