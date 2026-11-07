"use client";

import type { ObjectKind } from "@/lib/domain/catalog";
import { roomUseFromName } from "@/lib/domain/catalog";
import type { Box, BuildingInfo, Project, Sheet } from "@/lib/domain/types";
import { db, uid } from "@/lib/storage/db";
import { newProject, newSheet, today } from "./model";

interface SampleIndex {
  project: string;
  building: Omit<BuildingInfo, "confirmed">;
  samples: { id: string; title: string; floorLabel: string; level: number; file: string; truth: string }[];
}

interface Truth {
  title: string;
  floorLabel: string;
  level: number;
  width: number;
  height: number;
  dpi: number;
  ratioText: string;
  pxPerMeter: number;
  legendBox: Box;
  objects: { id: string; kind: ObjectKind; box: Box; label?: string }[];
}

/**
 * 합성 샘플 도면으로 체험용 프로젝트를 만든다.
 * 인식 결과 대신 도면 생성 시 만든 정답 데이터를 넣으므로 API 키 없이 전체 흐름을 볼 수 있다.
 * 축척과 건물 정보는 확인 단계를 거치도록 미확정 상태로 둔다.
 */
export async function createSampleProject(): Promise<Project> {
  const index: SampleIndex = await (await fetch("/samples/index.json")).json();
  const project = newProject(uid("proj"), "샘플: 성수동 근린생활시설", "서울특별시 성동구 성수동 (가상)", today());
  project.building = { ...index.building, confirmed: false };
  await db.putProject(project);

  for (const s of [...index.samples].sort((a, b) => b.level - a.level)) {
    const [blob, truth] = await Promise.all([
      fetch(`/samples/${s.file}`).then((r) => r.blob()),
      fetch(`/samples/${s.truth}`).then((r) => r.json() as Promise<Truth>),
    ]);
    const imageKey = uid("img");
    await db.putImage(imageKey, blob);
    const base = newSheet({ id: uid("sheet"), projectId: project.id, name: `${s.id}.png`, imageKey, width: truth.width, height: truth.height, dpi: truth.dpi });
    let lowMarked = false;
    const sheet: Sheet = {
      ...base,
      kind: "floor_plan",
      floorLabel: truth.floorLabel,
      level: truth.level,
      legendBox: truth.legendBox,
      scale: {
        pxPerMeter: truth.pxPerMeter,
        confirmed: false,
        method: "title_block",
        ratioText: truth.ratioText,
        estimates: [
          { method: "title_block", pxPerMeter: truth.pxPerMeter, note: `표제란 축척 ${truth.ratioText}, A3 용지 기준` },
          { method: "dimension", pxPerMeter: Math.round(truth.pxPerMeter * 1.004 * 100) / 100, note: "치수선 30,000mm 기준" },
        ],
        needsCalibration: false,
        note: "표제란 축척과 치수선 추정이 1% 이내로 일치합니다.",
        calibration: null,
      },
      detections: truth.objects.map((o) => {
        // 데모: 3층 스프링클러 헤드 하나는 신뢰도 낮음 (점선 박스 + 확인 필요)
        let confidence = 0.95;
        if (!lowMarked && o.kind === "sprinkler_head" && truth.level === 3) {
          confidence = 0.45;
          lowMarked = true;
        }
        return { id: o.id, kind: o.kind, box: o.box, confidence, source: "sample" as const, label: o.label, roomUse: o.label ? roomUseFromName(o.label) : undefined };
      }),
      hints: { use: "근린생활시설", floorLabel: truth.floorLabel, floorArea: 540, totalArea: 1620, aboveGroundFloors: 3, basementFloors: 0, notes: [] },
      analysis: { status: "done", source: "sample", model: "샘플 정답 데이터", finishedAt: new Date().toISOString() },
    };
    await db.putSheet(sheet);
  }
  return project;
}
