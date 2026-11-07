"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { fetchStatus, type AiStatus } from "@/lib/client/api";

const Ctx = createContext<AiStatus | null>(null);

export function AiStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    fetchStatus()
      .then(setStatus)
      .catch(() => setStatus({ ai: false, state: "unreachable", model: "", effort: "" }));
  }, []);
  return <Ctx.Provider value={status}>{children}</Ctx.Provider>;
}

export function useAiStatus(): AiStatus | null {
  return useContext(Ctx);
}

export function AiStatusPill() {
  const s = useAiStatus();
  if (!s) return <span className="text-xs text-gray-500">AI 상태 확인 중</span>;
  const label = { ok: "AI 연결됨", no_key: "AI 미연결", invalid_key: "AI 키 오류", unreachable: "AI 응답 없음" }[s.state];
  const title = {
    ok: `${s.model} · effort ${s.effort}`,
    no_key: "ANTHROPIC_API_KEY가 설정되지 않았습니다",
    invalid_key: "ANTHROPIC_API_KEY가 유효하지 않습니다",
    unreachable: "AI 서버에 연결하지 못했습니다",
  }[s.state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${s.ai ? "bg-green-500/10 text-green-300" : s.state === "invalid_key" ? "bg-red-500/10 text-red-300" : "bg-gray-500/15 text-gray-400"}`}
      title={title}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.ai ? "bg-green-400" : s.state === "invalid_key" ? "bg-red-400" : "bg-gray-500"}`} />
      {label}
    </span>
  );
}
