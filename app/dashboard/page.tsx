import { ProjectListClient } from "@/components/dashboard/project-list-client";
import { HeroGlow } from "@/components/main/hero";

export default function DashboardPage() {
  return (
    <main className="relative mx-auto w-full max-w-6xl px-4 pb-20 pt-12 sm:px-6 motion-safe:animate-fade-in">
      <HeroGlow className="pointer-events-none absolute left-1/2 top-[-260px] -z-0 w-[900px] max-w-none -translate-x-1/2 opacity-60" />
      <div className="relative">
        <h1 className="bg-linear-to-b from-white via-white to-white/60 bg-clip-text text-3xl font-semibold tracking-[-0.03em] text-transparent md:text-4xl">
          도면 검토
        </h1>
        <p className="mt-2 max-w-2xl break-keep text-sm text-gray-400 md:text-base">
          층별 평면도를 올리면 소방시설을 찾아 표시하고, 설치 의무와 배치 기준에 맞는지 근거 조문과 함께 검토합니다.
        </p>
        <div className="mt-8">
          <ProjectListClient />
        </div>
      </div>
    </main>
  );
}
