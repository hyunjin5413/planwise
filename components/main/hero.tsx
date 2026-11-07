import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Navigation } from "./navigation";
import { PlanReviewPreview } from "./plan-review-preview";

function ArrowRightGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

// 미리보기 뒤에 깔리는 주황색 빛 번짐
export function HeroGlow({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1078 800"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="pw-glow-halo">
          <stop offset="0%" stopColor="#f97316" stopOpacity={0.34} />
          <stop offset="50%" stopColor="#f97316" stopOpacity={0.16} />
          <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
        </radialGradient>
        <radialGradient id="pw-glow-core">
          <stop offset="0%" stopColor="#fdba74" stopOpacity={1} />
          <stop offset="50%" stopColor="#fdba74" stopOpacity={0.88} />
          <stop offset="78%" stopColor="#fdba74" stopOpacity={0.32} />
          <stop offset="100%" stopColor="#fdba74" stopOpacity={0} />
        </radialGradient>
      </defs>
      <ellipse cx={539} cy={360} rx={480} ry={250} fill="url(#pw-glow-halo)" />
      <ellipse cx={539} cy={282} rx={370} ry={62} fill="url(#pw-glow-core)" />
    </svg>
  );
}

function HeroSection() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-start px-6 py-20 md:py-24 motion-safe:animate-fade-in">
      <aside className="mb-8 inline-flex flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-full border border-gray-700 bg-gray-800/50 backdrop-blur-sm max-w-full">
        <span className="text-xs text-center whitespace-nowrap text-gray-400">
          화재안전기준 NFPC · NFTC 기반 AI 도면 검토
        </span>
        <a
          href="#how-it-works"
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-all active:scale-95 whitespace-nowrap"
          aria-label="PlanWise 검토 과정 알아보기"
        >
          알아보기
          <ArrowRightGlyph size={12} />
        </a>
      </aside>

      <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-center max-w-3xl px-6 leading-tight mb-6 tracking-[-0.04em] break-keep bg-linear-to-b from-white via-white to-white/60 bg-clip-text text-transparent">
        도면 속 소방법 위반,
        <br className="max-sm:hidden" /> 인허가 전에 찾아냅니다
      </h1>

      <p className="text-sm md:text-base text-center max-w-2xl px-6 mb-10 text-gray-400 break-keep">
        PlanWise AI가 건축 도면을 분석해 소방법 적합 여부를 검토하고,
        <br className="max-sm:hidden" /> 고쳐야 할 부분과 근거 조항까지 함께 안내합니다.
      </p>

      <div className="flex items-center gap-4 relative z-10 mb-16">
        <Link href="/dashboard" className={buttonClasses({ variant: "gradient", size: "lg", className: "rounded-lg" })}>
          도면 검토 시작하기
        </Link>
      </div>

      <div className="w-full max-w-5xl relative pb-20">
        <HeroGlow className="absolute left-1/2 top-[-23%] w-[90%] h-auto -translate-x-1/2 pointer-events-none z-0" />

        <div className="relative z-10">
          <PlanReviewPreview className="w-full h-auto rounded-xl shadow-2xl" />
        </div>
      </div>
    </section>
  );
}

export default function Hero() {
  return (
    <>
      <Navigation />
      <HeroSection />
    </>
  );
}
