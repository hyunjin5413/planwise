import { connection } from "next/server";
import { DETECT_EFFORT, MODEL, verifyAi } from "@/lib/ai/claude";

/** AI 연결 상태. 요청 시점에 키 유효성을 확인한다 (빌드 시 정적 응답으로 굳지 않게) */
export async function GET() {
  await connection();
  const state = await verifyAi();
  return Response.json({ ai: state === "ok", state, model: MODEL, effort: DETECT_EFFORT });
}
