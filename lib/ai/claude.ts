import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type * as z from "zod";

export const MODEL = process.env.PLANWISE_MODEL || "claude-opus-5-5";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** 도면 인식 단계의 effort. 기술 도면은 high 이상에서 정확도가 오른다 */
export const DETECT_EFFORT = (process.env.PLANWISE_DETECT_EFFORT as Effort) || "high";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export type AiState = "ok" | "no_key" | "invalid_key" | "unreachable";

let verified: { state: AiState; at: number } | null = null;

/** 키가 실제로 유효한지 모델 조회(과금 없음)로 확인한다. 5분간 캐시 */
export async function verifyAi(): Promise<AiState> {
  if (!aiConfigured()) return "no_key";
  if (verified && Date.now() - verified.at < 5 * 60_000) return verified.state;
  let state: AiState = "ok";
  try {
    await getClient().models.retrieve(MODEL);
  } catch (e) {
    state = e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError ? "invalid_key" : "unreachable";
  }
  verified = { state, at: Date.now() };
  return state;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic({ maxRetries: 2 });
  return client;
}

export class AiError extends Error {
  constructor(
    public code: "no_api_key" | "refusal" | "max_tokens" | "parse" | "auth" | "billing" | "rate_limit" | "overloaded" | "bad_request" | "upstream",
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export interface CallResult<T> {
  data: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * 구조화된 출력으로 Claude를 호출한다.
 * - 긴 출력에 대비해 스트리밍으로 받고 finalMessage()로 모은다.
 * - 정책 거절 시 서버 측 기본 폴백 모델로 재시도한다 (fallbacks: "default").
 */
export async function callStructured<S extends z.ZodType>(opts: {
  system: string;
  content: BetaContentBlockParam[];
  schema: S;
  effort: Effort;
  maxTokens: number;
}): Promise<CallResult<z.infer<S>>> {
  if (!aiConfigured()) throw new AiError("no_api_key", "ANTHROPIC_API_KEY가 설정되어 있지 않습니다.", 503);
  try {
    const stream = getClient().beta.messages.stream({
      model: MODEL,
      max_tokens: opts.maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
      system: opts.system,
      messages: [{ role: "user", content: opts.content }],
    });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") throw new AiError("refusal", "모델이 요청을 처리하지 않았습니다.", 422);
    if (msg.stop_reason === "max_tokens") throw new AiError("max_tokens", "응답이 길이 제한에서 잘렸습니다.", 502);
    if (msg.parsed_output == null) throw new AiError("parse", "응답을 해석하지 못했습니다.", 502);
    return {
      data: msg.parsed_output as z.infer<S>,
      model: msg.model,
      usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
    };
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
      throw new AiError("auth", "API 키를 확인하십시오.", 401);
    if (e instanceof Anthropic.RateLimitError) throw new AiError("rate_limit", "요청 한도에 걸렸습니다. 잠시 후 다시 시도하십시오.", 429);
    // 키는 유효해도 크레딧이 없으면 400으로 온다 (상태 확인용 모델 조회는 통과하므로 여기서 구분)
    if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message))
      throw new AiError("billing", "API 크레딧이 부족합니다. Claude Console의 Plans & Billing에서 크레딧을 충전하십시오.", 402);
    if (e instanceof Anthropic.BadRequestError) throw new AiError("bad_request", `요청 오류: ${e.message}`, 400);
    if (e instanceof Anthropic.InternalServerError) throw new AiError("overloaded", "AI 서버가 응답하지 않습니다. 잠시 후 다시 시도하십시오.", 503);
    if (e instanceof Anthropic.APIError) throw new AiError("upstream", `AI 호출 실패 (${e.status ?? "network"})`, 502);
    throw e;
  }
}

export function imageBlock(data: Buffer, mediaType: "image/png" | "image/jpeg" = "image/png"): BetaContentBlockParam {
  return { type: "image", source: { type: "base64", media_type: mediaType, data: data.toString("base64") } };
}

export function textBlock(text: string): BetaContentBlockParam {
  return { type: "text", text };
}
