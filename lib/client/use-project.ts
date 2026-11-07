"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, Sheet } from "@/lib/domain/types";
import { db, uid } from "@/lib/storage/db";
import type { IngestedPage } from "./ingest";
import { newSheet } from "./model";

export function useProject(projectId: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const projectRef = useRef<Project | null>(null);
  const sheetsRef = useRef<Sheet[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await db.getProject(projectId);
      if (!alive) return;
      if (!p) {
        setStatus("missing");
        return;
      }
      const list = (await db.listSheets(projectId)).sort((a, b) => (b.level ?? -99) - (a.level ?? -99) || a.createdAt.localeCompare(b.createdAt));
      if (!alive) return;
      projectRef.current = p;
      sheetsRef.current = list;
      setProject(p);
      setSheets(list);
      setStatus("ready");
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  const updateProject = useCallback((fn: (p: Project) => Project) => {
    const cur = projectRef.current;
    if (!cur) return;
    const next = { ...fn(cur), updatedAt: new Date().toISOString() };
    projectRef.current = next;
    setProject(next);
    void db.putProject(next);
  }, []);

  const updateSheet = useCallback((id: string, fn: (s: Sheet) => Sheet) => {
    const list = sheetsRef.current;
    const idx = list.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const next = fn(list[idx]);
    const nextList = [...list];
    nextList[idx] = next;
    sheetsRef.current = nextList;
    setSheets(nextList);
    void db.putSheet(next);
  }, []);

  const addPages = useCallback(async (pages: IngestedPage[]) => {
    const cur = projectRef.current;
    if (!cur) return [];
    const created: Sheet[] = [];
    for (const p of pages) {
      const imageKey = uid("img");
      await db.putImage(imageKey, p.blob);
      const sheet = newSheet({ id: uid("sheet"), projectId: cur.id, name: p.name, imageKey, width: p.width, height: p.height, dpi: p.dpi });
      await db.putSheet(sheet);
      created.push(sheet);
    }
    const nextList = [...sheetsRef.current, ...created];
    sheetsRef.current = nextList;
    setSheets(nextList);
    return created;
  }, []);

  const removeSheet = useCallback(async (id: string) => {
    const sh = sheetsRef.current.find((s) => s.id === id);
    if (!sh) return;
    await db.deleteSheet(sh);
    const nextList = sheetsRef.current.filter((s) => s.id !== id);
    sheetsRef.current = nextList;
    setSheets(nextList);
  }, []);

  return { project, sheets, status, updateProject, updateSheet, addPages, removeSheet, sheetsRef };
}

/** IndexedDB에 저장된 도면 이미지를 object URL로 */
export function useImageUrl(imageKey: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!imageKey) return;
    let alive = true;
    let objectUrl: string | null = null;
    void db.getImage(imageKey).then((blob) => {
      if (!alive || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [imageKey]);
  return url;
}
