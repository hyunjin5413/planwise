"use client";

import type { Project, Sheet } from "@/lib/domain/types";

/**
 * 브라우저 IndexedDB 저장소.
 * 프로젝트·시트 메타데이터와 도면 이미지(blob)를 사용자 기기에만 저장한다.
 * 서버 저장소(DB, 암호화 보관)는 배포 형태가 정해진 뒤 이 인터페이스 뒤에 붙인다.
 */

const DB_NAME = "planwise";
const DB_VERSION = 1;
type StoreName = "projects" | "sheets" | "images";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("sheets")) {
        const s = db.createObjectStore("sheets", { keyPath: "id" });
        s.createIndex("projectId", "projectId");
      }
      if (!db.objectStoreNames.contains("images")) db.createObjectStore("images");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return wrap(fn(db.transaction(store, mode).objectStore(store)));
}

export const db = {
  listProjects: () => tx<Project[]>("projects", "readonly", (s) => s.getAll() as IDBRequest<Project[]>),
  getProject: (id: string) => tx<Project | undefined>("projects", "readonly", (s) => s.get(id) as IDBRequest<Project | undefined>),
  putProject: (p: Project) => tx("projects", "readwrite", (s) => s.put(p)),
  async deleteProject(id: string) {
    const sheets = await db.listSheets(id);
    for (const sh of sheets) await db.deleteSheet(sh);
    await tx("projects", "readwrite", (s) => s.delete(id));
  },
  listSheets: (projectId: string) =>
    tx<Sheet[]>("sheets", "readonly", (s) => s.index("projectId").getAll(projectId) as IDBRequest<Sheet[]>),
  putSheet: (sh: Sheet) => tx("sheets", "readwrite", (s) => s.put(sh)),
  async deleteSheet(sh: Sheet) {
    await tx("sheets", "readwrite", (s) => s.delete(sh.id));
    await tx("images", "readwrite", (s) => s.delete(sh.imageKey));
  },
  getImage: (key: string) => tx<Blob | undefined>("images", "readonly", (s) => s.get(key) as IDBRequest<Blob | undefined>),
  putImage: (key: string, blob: Blob) => tx("images", "readwrite", (s) => s.put(blob, key)),
};

export function uid(prefix: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}
