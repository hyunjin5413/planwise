import { Suspense } from "react";
import { Workspace } from "@/components/dashboard/workspace";

// 프로젝트 데이터는 브라우저 IndexedDB에 있으므로 클라이언트에서 불러온다
export default function ProjectPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-gray-400">프로젝트를 여는 중</div>}>
      <Workspace />
    </Suspense>
  );
}
