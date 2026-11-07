/**
 * 실제 Claude로 샘플 도면을 분석해 PRD 성공 지표를 잰다. API 비용이 들므로 기본은 건너뛴다.
 * 실행: PLANWISE_EVAL=1 npx vitest run tests/eval.live.test.ts
 * 결과: eval-results/<시각>.json
 */
import { describe, expect, it } from "vitest";
import { analyzeSheet } from "@/lib/ai/analyze";
import { EVAL_SAMPLES, loadSampleImage, scoreSheet, summarize } from "./eval-score";

describe.skipIf(!process.env.PLANWISE_EVAL)("실제 AI 인식 평가 (PRD 성공 지표)", () => {
  it(
    "샘플 도면 인식 정확도",
    async () => {
      const scored = [];
      for (const id of EVAL_SAMPLES) {
        const t0 = Date.now();
        const out = await analyzeSheet({ image: loadSampleImage(id) });
        scored.push(scoreSheet(id, out, (Date.now() - t0) / 1000));
      }
      const { file, summary } = summarize(process.env.PLANWISE_MODEL || "claude-opus-5-5", scored);
      console.log(JSON.stringify({ file, ...summary, samples: summary.samples.map((r) => ({ ...r, perKind: undefined })) }, null, 2));
      expect(scored.length).toBe(EVAL_SAMPLES.length);
    },
    20 * 60_000,
  );
});
