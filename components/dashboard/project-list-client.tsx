"use client";

import dynamic from "next/dynamic";
import { Spinner } from "./ui";

/** 프로젝트 목록은 브라우저 저장소(IndexedDB)를 읽으므로 브라우저에서만 렌더링한다 */
export const ProjectListClient = dynamic(() => import("./project-list").then((m) => m.ProjectList), {
  ssr: false,
  loading: () => (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <Spinner /> 불러오는 중
    </div>
  ),
});
