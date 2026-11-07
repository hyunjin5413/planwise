import { callStructured, textBlock } from "./claude";
import { GUIDE_SYSTEM } from "./prompts";
import { GuideSchema } from "./schemas";

export interface GuideRequest {
  title: string;
  typeLabel: string;
  floorLabel: string | null;
  roomName: string | null;
  content: string;
  measured: string | null;
  criterion: string | null;
  templateGuide: string;
  citation: { law: string; short: string; article: string; title: string };
  standardDate: string;
  facts: Record<string, string | number>;
}

export interface GuideResponse {
  text: string;
  /** 근거 검증을 통과했는지. false면 text는 규칙 엔진의 템플릿 문장 */
  grounded: boolean;
  model: string | null;
  reason?: string;
}

const NUM = /\d+(?:[.,]\d+)*/g;

function numbersIn(s: string): string[] {
  return (s.match(NUM) ?? []).map((n) => n.replace(/,/g, ""));
}

/**
 * LLM이 쓴 문장의 숫자가 모두 근거(판정 사실, 템플릿, 조문, 기준일)에 있는지 확인한다.
 * 근거에 없는 숫자가 하나라도 있으면 쓰지 않는다 (PRD: 근거 없는 내용 생성 금지).
 */
export function validateGrounding(text: string, req: GuideRequest): { ok: boolean; reason?: string } {
  const sources = [
    req.title,
    req.content,
    req.measured ?? "",
    req.criterion ?? "",
    req.templateGuide,
    req.citation.law,
    req.citation.short,
    req.citation.article,
    req.citation.title,
    req.standardDate,
    req.floorLabel ?? "",
    req.roomName ?? "",
    ...Object.values(req.facts).map(String),
  ].join(" ");
  const allowed = new Set(numbersIn(sources));
  for (const d of req.standardDate.split("-")) allowed.add(String(Number(d)));
  const extra = numbersIn(text).filter((n) => !allowed.has(n) && !allowed.has(String(Number(n))));
  if (extra.length > 0) return { ok: false, reason: `근거에 없는 수치: ${extra.join(", ")}` };
  if (!text.includes("근거")) return { ok: false, reason: "근거 문구 없음" };
  return { ok: true };
}

export async function refineGuide(req: GuideRequest): Promise<GuideResponse> {
  const facts = {
    지적: req.title,
    판정유형: req.typeLabel,
    층: req.floorLabel,
    위치: req.roomName,
    내용: req.content,
    측정값: req.measured,
    기준값: req.criterion,
    근거법령: `${req.citation.law} (${req.citation.short}) ${req.citation.article}: ${req.citation.title}`,
    기준일: req.standardDate,
    세부사실: req.facts,
    규칙엔진_가이드: req.templateGuide,
  };
  const res = await callStructured({
    system: GUIDE_SYSTEM,
    content: [textBlock(`다음 판정 사실만으로 수정 가이드를 다듬어라.\n\n${JSON.stringify(facts, null, 2)}`)],
    schema: GuideSchema,
    effort: "low",
    maxTokens: 4000,
  });
  const text = res.data.guide.trim();
  const check = validateGrounding(text, req);
  if (!check.ok) return { text: req.templateGuide, grounded: false, model: res.model, reason: check.reason };
  return { text, grounded: true, model: res.model };
}
