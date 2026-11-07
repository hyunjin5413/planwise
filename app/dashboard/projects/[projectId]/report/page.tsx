import { Suspense } from "react";
import { ReportView } from "@/components/dashboard/report-view";

export default function ReportPage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-sm text-gray-400">리포트를 만드는 중</p>}>
      <ReportView />
    </Suspense>
  );
}
