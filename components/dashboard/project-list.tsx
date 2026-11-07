"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { newProject, today } from "@/lib/client/model";
import { createSampleProject } from "@/lib/client/samples";
import type { Project } from "@/lib/domain/types";
import { db, uid } from "@/lib/storage/db";
import { Card, Field, ghostBtn, inputCls, primaryBtn, Spinner } from "./ui";

interface Row {
  project: Project;
  sheetCount: number;
}

async function fetchRows(): Promise<Row[]> {
  const projects = await db.listProjects();
  const withCounts = await Promise.all(projects.map(async (p) => ({ project: p, sheetCount: (await db.listSheets(p.id)).length })));
  return withCounts.sort((a, b) => b.project.updatedAt.localeCompare(a.project.updatedAt));
}

export function ProjectList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  // 이 컴포넌트는 브라우저에서만 렌더링한다 (project-list-client.tsx). 기준일 기본값은 오늘
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState<"create" | "sample" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => fetchRows().then(setRows);

  useEffect(() => {
    let alive = true;
    fetchRows()
      .then((r) => alive && setRows(r))
      .catch(() => alive && setError("브라우저 저장소를 열지 못했습니다. 시크릿 모드에서는 저장이 제한될 수 있습니다."));
    return () => {
      alive = false;
    };
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy("create");
    const p = newProject(uid("proj"), name.trim(), address.trim(), date || today());
    await db.putProject(p);
    router.push(`/dashboard/projects/${p.id}`);
  };

  const sample = async () => {
    setBusy("sample");
    setError(null);
    try {
      const p = await createSampleProject();
      router.push(`/dashboard/projects/${p.id}`);
    } catch {
      setError("샘플 도면을 불러오지 못했습니다.");
      setBusy(null);
    }
  };

  const remove = async (p: Project) => {
    if (!confirm(`'${p.name}' 프로젝트와 도면을 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await db.deleteProject(p.id);
    await load();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="h-fit p-5">
        <h2 className="text-base font-semibold">새 프로젝트</h2>
        <p className="mt-1 text-sm text-gray-400">건물 단위로 프로젝트를 만들고 층별 평면도를 올립니다.</p>
        <form onSubmit={create} className="mt-5 flex flex-col gap-4">
          <Field label="건물명">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 성수동 근린생활시설 신축" required />
          </Field>
          <Field label="주소 (선택)">
            <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="예: 서울특별시 성동구 …" />
          </Field>
          <Field label="적용 기준일" hint="허가 신청일을 지정하면 그 날짜에 시행 중인 기준으로 검토합니다.">
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <button type="submit" className={`${primaryBtn} h-10`} disabled={busy !== null || !name.trim()}>
            {busy === "create" && <Spinner />}
            프로젝트 만들기
          </button>
        </form>
        <div className="mt-5 border-t border-gray-800 pt-5">
          <p className="text-sm text-gray-400">도면 없이 둘러보려면 합성 샘플 도면(1층·3층)으로 체험해 보세요.</p>
          <button type="button" className={`${ghostBtn} mt-3 w-full`} onClick={sample} disabled={busy !== null}>
            {busy === "sample" && <Spinner />}
            샘플 프로젝트로 체험하기
          </button>
        </div>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">프로젝트</h2>
          {rows && <span className="text-xs text-gray-500">{rows.length}개 · 이 브라우저에 저장됨</span>}
        </div>
        {error && <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        {rows === null ? (
          <Card className="flex items-center gap-2 p-6 text-sm text-gray-400">
            <Spinner /> 불러오는 중
          </Card>
        ) : rows.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-sm text-gray-300">아직 프로젝트가 없습니다.</p>
            <p className="mt-1 text-sm text-gray-500">왼쪽에서 새 프로젝트를 만들거나 샘플로 체험해 보세요.</p>
          </Card>
        ) : (
          rows.map(({ project: p, sheetCount }) => (
            <Card key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <Link href={`/dashboard/projects/${p.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium text-white hover:underline">{p.name}</p>
                <p className="mt-1 truncate text-xs text-gray-500">
                  {p.address || "주소 없음"} · 기준일 {p.standardDate} · 도면 {sheetCount}장 · {p.building.confirmed ? "건물 정보 확인됨" : "건물 정보 미확인"}
                </p>
              </Link>
              <div className="flex shrink-0 gap-2">
                <Link href={`/dashboard/projects/${p.id}`} className={primaryBtn}>
                  열기
                </Link>
                <button type="button" className={ghostBtn} onClick={() => remove(p)}>
                  삭제
                </button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
