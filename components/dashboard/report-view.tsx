"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useImageUrl, useProject } from "@/lib/client/use-project";
import { FACILITY_KINDS, OBJECT_CATALOG } from "@/lib/domain/catalog";
import { BUILDING_USE_LABELS, FINDING_ACTION_LABELS, FINDING_TYPE_LABELS, FINDING_TYPE_ORDER, type Project, type Sheet } from "@/lib/domain/types";
import { DISCLAIMER, getCitation, type Citation } from "@/lib/engine/legal";
import { FIRE_SYSTEM_LABELS, totalAreaOf } from "@/lib/engine/requirements";
import { LOW_CONFIDENCE, reviewProject, type Finding, type ReviewResult, type Tally } from "@/lib/engine/review";
import { statusText } from "./tally-panel";

const TYPE_COLOR: Record<string, string> = { violation: "#dc2626", missing: "#ea580c", check: "#d97706", pending: "#6b7280" };

function fmtDate(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ReportView() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project, sheets, status } = useProject(projectId);
  if (status === "loading") return <p className="p-10 text-center text-sm text-gray-400">리포트를 만드는 중</p>;
  if (!project) return <p className="p-10 text-center text-sm text-gray-400">프로젝트를 찾지 못했습니다.</p>;
  const review = reviewProject(project, sheets);
  const plans = sheets.filter((s) => s.kind === "floor_plan");

  return (
    <div className="report bg-gray-800 py-8 print:bg-white print:py-0">
      <style>{`
        @page { size: A4; margin: 14mm 12mm 18mm; }
        @page drawing { size: A4 landscape; margin: 10mm 10mm 16mm; }
        @media print {
          html, body { background: #fff !important; }
          .report-page { box-shadow: none !important; margin: 0 !important; width: auto !important; min-height: 0 !important; padding: 0 !important; }
          .report-page + .report-page { break-before: page; }
          .report-footer { position: fixed; bottom: 0; left: 0; right: 0; }
        }
      `}</style>

      <div className="mx-auto mb-6 flex max-w-[210mm] items-center justify-between px-2 print:hidden">
        <Link href={`/dashboard/projects/${project.id}`} className="text-sm text-gray-300 hover:text-white">
          검토 결과로 돌아가기
        </Link>
        <button type="button" onClick={() => window.print()} className="h-9 cursor-pointer rounded-md bg-white px-4 text-sm font-medium text-black hover:bg-gray-200">
          PDF로 저장 (인쇄)
        </button>
      </div>

      <Cover project={project} sheets={sheets} review={review} />
      {plans.map((s) => (
        <DrawingPage key={s.id} sheet={s} review={review} />
      ))}
      <TallyPage plans={plans} review={review} />
      <FindingsPage project={project} review={review} />
      <StandardsPage project={project} review={review} />

      <p className="report-footer hidden px-[12mm] pb-[6mm] text-[8pt] text-gray-500 print:block">
        {project.name} · 기준일 {project.standardDate} · {DISCLAIMER}
      </p>
    </div>
  );
}

function Page({ children, landscape = false }: { children: React.ReactNode; landscape?: boolean }) {
  return (
    <section
      className={`report-page mx-auto mb-6 bg-white p-[14mm] text-[10pt] leading-relaxed text-gray-900 shadow-2xl ${landscape ? "w-[297mm]" : "w-[210mm]"}`}
      style={landscape ? { page: "drawing" } : undefined}
    >
      {children}
      <p className="mt-6 border-t border-gray-200 pt-2 text-[8pt] text-gray-500 print:hidden">{DISCLAIMER}</p>
    </section>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 border-b-2 border-gray-900 pb-1.5 text-[13pt] font-bold">{children}</h2>;
}

function Cover({ project, sheets, review }: { project: Project; sheets: Sheet[]; review: ReviewResult }) {
  const b = project.building;
  const counts = Object.fromEntries(FINDING_TYPE_ORDER.map((t) => [t, review.findings.filter((f) => f.type === t).length]));
  const total = totalAreaOf(b);
  return (
    <Page>
      <p className="text-[9pt] font-semibold tracking-widest text-orange-600">PLANWISE</p>
      <h1 className="mt-2 text-[22pt] font-bold leading-tight">소방 도면 검토 리포트</h1>
      <p className="mt-1 text-[12pt] text-gray-600">{project.name}</p>

      <table className="mt-5 w-full border-collapse text-[9pt]">
        <tbody>
          {[
            ["주소", project.address || "-"],
            ["적용 기준일", `${project.standardDate} (이 날짜에 시행 중인 조문으로 검토)`],
            ["검토 일시", fmtDate(review.computedAt)],
            ["규칙 버전", review.ruleSetVersion ?? "해당 없음"],
            ["주용도", `${BUILDING_USE_LABELS[b.use]}${b.useDetail ? ` · ${b.useDetail}` : ""}`],
            ["규모", `지상 ${b.aboveGroundFloors}층 · 지하 ${b.basementFloors}층 · 연면적 ${total != null ? `${total.toLocaleString("ko-KR")}㎡` : "미입력"} · ${b.fireResistant ? "주요구조부 내화구조" : "비내화구조"}`],
            ["건물 정보", b.confirmed ? "사용자 확인 완료" : "미확인 (설치 대상 판정 보류)"],
          ].map(([k, v]) => (
            <tr key={k} className="border-b border-gray-200">
              <th className="w-28 py-1.5 text-left font-semibold text-gray-600">{k}</th>
              <td className="py-1.5">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mb-1.5 mt-5 text-[11pt] font-bold">검토 도면</h3>
      <table className="w-full border-collapse text-[9pt]">
        <thead>
          <tr className="border-b border-gray-900 text-left">
            <th className="py-1.5">층</th>
            <th>시트</th>
            <th>파일</th>
            <th>축척</th>
            <th>인식</th>
          </tr>
        </thead>
        <tbody>
          {sheets.map((s) => (
            <tr key={s.id} className="border-b border-gray-200">
              <td className="py-1.5">{s.floorLabel}</td>
              <td>{s.kind === "floor_plan" ? "평면도" : "평면도 아님 (분류만)"}</td>
              <td className="max-w-[60mm] truncate">{s.name}</td>
              <td>{s.scale.confirmed && s.scale.pxPerMeter ? `확정 (${s.scale.ratioText ?? `${s.scale.pxPerMeter.toFixed(1)}px/m`})` : "미확정"}</td>
              <td>{s.analysis.source === "ai" ? `AI (${s.analysis.model})` : s.analysis.source === "sample" ? "샘플 정답" : "수동 입력"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mb-1.5 mt-5 text-[11pt] font-bold">지적 사항 요약</h3>
      <div className="grid grid-cols-4 gap-2">
        {FINDING_TYPE_ORDER.map((t) => (
          <div key={t} className="rounded border border-gray-300 px-3 py-2">
            <p className="text-[8.5pt] text-gray-500">{FINDING_TYPE_LABELS[t]}</p>
            <p className="text-[16pt] font-bold" style={{ color: TYPE_COLOR[t] }}>
              {counts[t]}건
            </p>
          </div>
        ))}
      </div>

      {review.requirements && (
        <>
          <h3 className="mb-1.5 mt-5 text-[11pt] font-bold">설치 대상 판정 (시행령 별표 4)</h3>
          <table className="w-full border-collapse text-[9pt]">
            <tbody>
              {review.requirements.map((r) => (
                <tr key={r.system} className="border-b border-gray-200">
                  <td className="w-36 py-1 font-medium">{FIRE_SYSTEM_LABELS[r.system]}</td>
                  <td className="w-24">{r.required ? (r.levels ? "해당 층 대상" : "설치 대상") : "대상 아님"}</td>
                  <td className="text-gray-600">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Page>
  );
}

function DrawingPage({ sheet: s, review }: { sheet: Sheet; review: ReviewResult }) {
  const url = useImageUrl(s.imageKey);
  const findings = review.findings.filter((f) => f.sheetId === s.id);
  const located = findings.filter((f) => f.location);
  const fs = Math.max(s.width, s.height) / 140;
  const kinds = FACILITY_KINDS.filter((k) => s.detections.some((d) => d.kind === k));
  return (
    <Page landscape>
      <H2>
        {s.floorLabel} 오버레이 도면 <span className="text-[10pt] font-normal text-gray-500">· 지적 {findings.length}건 · 객체 {s.detections.length}개</span>
      </H2>
      <div className="relative w-full border border-gray-300" style={{ aspectRatio: `${s.width} / ${s.height}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저에 저장된 blob URL */}
        {url && <img src={url} alt={`${s.floorLabel} 도면`} className="absolute inset-0 h-full w-full" />}
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${s.width} ${s.height}`} aria-hidden="true">
          {s.detections
            .filter((d) => d.kind !== "window")
            .map((d) => {
              const info = OBJECT_CATALOG[d.kind];
              return (
                <rect
                  key={d.id}
                  x={d.box.x}
                  y={d.box.y}
                  width={d.box.w}
                  height={d.box.h}
                  fill="none"
                  stroke={info.color}
                  strokeOpacity={d.kind === "room" ? 0.4 : 1}
                  strokeWidth={d.kind === "room" ? 0.8 : 1.4}
                  vectorEffect="non-scaling-stroke"
                  strokeDasharray={d.confidence < LOW_CONFIDENCE ? "4 3" : undefined}
                />
              );
            })}
          {located.map((f) => (
            <g key={f.key}>
              <rect x={f.location!.x} y={f.location!.y} width={f.location!.w} height={f.location!.h} fill="#dc2626" fillOpacity={0.06} stroke="#dc2626" strokeWidth={1.6} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              <circle cx={f.location!.x} cy={f.location!.y} r={fs * 0.9} fill="#dc2626" />
              <text x={f.location!.x} y={f.location!.y} dy="0.35em" textAnchor="middle" fontSize={fs} fontWeight={700} fill="#fff">
                {f.no}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[8.5pt] text-gray-600">
        {kinds.map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 border-2" style={{ borderColor: OBJECT_CATALOG[k].color }} />
            {OBJECT_CATALOG[k].abbr} {OBJECT_CATALOG[k].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-4 border-2 border-dashed border-red-600" />
          지적 위치
        </span>
        <span>점선 박스: 신뢰도 낮음 (확인 필요)</span>
      </div>
    </Page>
  );
}

function TallyPage({ plans, review }: { plans: Sheet[]; review: ReviewResult }) {
  const cell = (t: Tally | undefined) => {
    if (!t) return "-";
    const st = statusText(t);
    return (
      <span className={st.tone === "red" ? "font-bold text-red-600" : st.tone === "gray" ? "text-gray-400" : ""}>
        {st.main}
        {st.sub && <span className="block text-[7.5pt] font-normal text-gray-500">{st.sub}</span>}
      </span>
    );
  };
  return (
    <Page>
      <H2>종류별 집계표</H2>
      <table className="w-full border-collapse text-[9pt]">
        <thead>
          <tr className="border-b-2 border-gray-900 text-left">
            <th className="py-1.5">종류</th>
            {plans.map((s) => (
              <th key={s.id} className="text-center">
                {s.floorLabel}
              </th>
            ))}
            <th className="text-center">전체</th>
          </tr>
        </thead>
        <tbody>
          {FACILITY_KINDS.map((k) => (
            <tr key={k} className="border-b border-gray-200 align-top">
              <td className="py-1.5 font-medium">
                <span className="mr-1.5 inline-block rounded px-1 text-[7.5pt] font-bold text-white" style={{ backgroundColor: OBJECT_CATALOG[k].color }}>
                  {OBJECT_CATALOG[k].abbr}
                </span>
                {OBJECT_CATALOG[k].label}
              </td>
              {plans.map((s) => (
                <td key={s.id} className="text-center">
                  {cell(review.sheets.find((x) => x.sheetId === s.id)?.tallies.find((t) => t.kind === k))}
                </td>
              ))}
              <td className="text-center">{cell(review.totals.find((t) => t.kind === k))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[8.5pt] text-gray-500">&quot;없음 · 설치 필요&quot;는 설치 의무가 있는데 도면에서 찾지 못한 시설, &quot;없음 · 설치 대상 아님&quot;은 의무가 없는 시설입니다.</p>
    </Page>
  );
}

function FindingsPage({ project, review }: { project: Project; review: ReviewResult }) {
  return (
    <Page>
      <H2>지적 사항 ({review.findings.length}건)</H2>
      {review.findings.length === 0 && <p className="text-gray-500">지적 사항이 없습니다.</p>}
      <ol className="space-y-3">
        {review.findings.map((f) => (
          <FindingRow key={f.key} f={f} project={project} />
        ))}
      </ol>
    </Page>
  );
}

function FindingRow({ f, project }: { f: Finding; project: Project }) {
  const action = project.findingActions[f.key];
  const guide = project.guideTexts[f.key]?.text ?? f.guide;
  return (
    <li className="break-inside-avoid rounded border border-gray-300 px-3 py-2">
      <div className="flex items-baseline gap-2">
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[8.5pt] font-bold text-white" style={{ backgroundColor: TYPE_COLOR[f.type] }}>
          {f.no}
        </span>
        <span className="font-bold">{f.title}</span>
        <span className="text-[8.5pt]" style={{ color: TYPE_COLOR[f.type] }}>
          {FINDING_TYPE_LABELS[f.type]}
        </span>
        <span className="ml-auto text-[8.5pt] text-gray-500">{[f.floorLabel ?? "건물 전체", f.roomName].filter(Boolean).join(" · ")}</span>
      </div>
      <p className="mt-1.5">{f.content}</p>
      {(f.measured || f.criterion) && (
        <p className="mt-1 text-[9pt] text-gray-600">
          측정값 {f.measured ?? "-"} · 기준값 {f.criterion ?? "-"}
        </p>
      )}
      <p className="mt-1.5 text-[9pt]">
        <span className="font-semibold">수정 가이드</span> {guide}
      </p>
      <p className="mt-1 text-[8.5pt] text-gray-500">
        근거: {f.citation.law} {f.citation.article} ({f.citation.checkedVersion}){!f.citation.verified && " · 원문 대조 전 기준"} · 신뢰도 {Math.round(f.confidence * 100)}%
      </p>
      {action && action.status !== "open" && (
        <p className="mt-1 text-[8.5pt] text-gray-700">
          사용자 조치: {FINDING_ACTION_LABELS[action.status]}
          {action.memo && ` · ${action.memo}`}
        </p>
      )}
    </li>
  );
}

function StandardsPage({ project, review }: { project: Project; review: ReviewResult }) {
  const map = new Map<string, Citation>();
  const base = getCitation("ENF-ATT4", project.standardDate);
  map.set(`${base.id}|${base.article}`, base);
  for (const f of review.findings) map.set(`${f.citation.id}|${f.citation.article}`, f.citation);
  const list = [...map.values()];
  return (
    <Page>
      <H2>적용 기준 목록</H2>
      <p className="mb-3 text-[9pt] text-gray-600">
        적용 기준일 {project.standardDate}에 시행 중인 조문 버전입니다. 규칙 버전 {review.ruleSetVersion ?? "-"}.
      </p>
      <table className="w-full border-collapse text-[9pt]">
        <thead>
          <tr className="border-b-2 border-gray-900 text-left">
            <th className="py-1.5">법령·기준</th>
            <th>조항</th>
            <th>요지</th>
            <th>대조 버전</th>
          </tr>
        </thead>
        <tbody>
          {list.map((c) => (
            <tr key={`${c.id}|${c.article}`} className="border-b border-gray-200 align-top">
              <td className="py-1.5 pr-2 font-medium">{c.law}</td>
              <td className="pr-2">{c.article}</td>
              <td className="pr-2 text-gray-700">{c.title}</td>
              <td className="text-gray-600">
                {c.checkedVersion}
                {!c.verified && <span className="block text-amber-700">원문 대조 전</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Page>
  );
}
