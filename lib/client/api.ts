"use client";

import type { AnalyzeOutput } from "@/lib/ai/analyze";
import type { GuideRequest, GuideResponse } from "@/lib/ai/guide";

export interface AiStatus {
  ai: boolean;
  state: "ok" | "no_key" | "invalid_key" | "unreachable";
  model: string;
  effort: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let body: { error?: string; code?: string } = {};
  try {
    body = await res.json();
  } catch {}
  throw new ApiError(body.error ?? `요청 실패 (${res.status})`, body.code ?? "http", res.status);
}

export async function fetchStatus(): Promise<AiStatus> {
  return parse(await fetch("/api/status", { cache: "no-store" }));
}

export async function analyzeImage(blob: Blob, dpi: number | null, signal?: AbortSignal): Promise<AnalyzeOutput> {
  const form = new FormData();
  form.append("file", blob, "sheet.png");
  if (dpi) form.append("dpi", String(dpi));
  return parse(await fetch("/api/analyze", { method: "POST", body: form, signal }));
}

export async function requestGuide(req: GuideRequest): Promise<GuideResponse> {
  return parse(await fetch("/api/guide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) }));
}
