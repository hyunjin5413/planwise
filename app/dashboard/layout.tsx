import type { Metadata } from "next";
import Link from "next/link";
import { AiStatusPill, AiStatusProvider } from "@/components/dashboard/ai-status";

export const metadata: Metadata = {
  title: "대시보드 | PlanWise",
  description: "도면을 올리고 소방법 적합 여부를 검토합니다.",
};

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  return (
    <AiStatusProvider>
      <div className="flex min-h-screen flex-col bg-black text-white">
        <header className="sticky top-0 z-40 border-b border-gray-800/50 bg-black/80 backdrop-blur-md print:hidden">
          <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-6">
              <Link href="/" className="text-lg font-semibold text-white">
                PlanWise
              </Link>
              <Link href="/dashboard" className="text-sm text-white/60 transition-colors hover:text-white">
                프로젝트
              </Link>
            </div>
            <AiStatusPill />
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </AiStatusProvider>
  );
}
