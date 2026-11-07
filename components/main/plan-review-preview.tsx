/**
 * PlanWise 도면 검토 화면 목업 (순수 SVG).
 * 평면도 위에 소방 부적합 지점을 표시하고, 우측에 검토 결과와 수정 가이드를 보여준다.
 * 표시된 수치와 조항은 예시이며 실제 검토 결과가 아니다.
 */

const C = {
  frame: "#0a0a0a",
  sidebar: "#0d0d0d",
  card: "#111111",
  cardRaised: "#161616",
  border: "#262626",
  borderSoft: "#1c1c1c",
  text: "#fafafa",
  body: "#d4d4d4",
  muted: "#a3a3a3",
  subtle: "#737373",
  plan: "#0b0b0b",
  grid: "#151515",
  wall: "#d4d4d4",
  wallInner: "#8a8a8a",
  stair: "#3a3a3a",
  orange: "#f97316",
  orangeText: "#fb923c",
  red: "#ef4444",
  redText: "#f87171",
  amber: "#f59e0b",
  amberText: "#fbbf24",
  green: "#22c55e",
  greenText: "#4ade80",
} as const;

const tones = {
  red: { solid: C.red, text: C.redText },
  amber: { solid: C.amber, text: C.amberText },
} as const;

const sideNav = ["대시보드", "도면 검토", "검토 리포트", "법령 라이브러리", "프로젝트"];
const ACTIVE_NAV = 1;

const stats = [
  { label: "검토 항목", value: "128", note: "NFPC · NFTC", dot: C.subtle, noteColor: C.subtle },
  { label: "적합", value: "119", note: "93%", dot: C.green, noteColor: C.greenText },
  { label: "부적합", value: "6", note: "수정 필요", dot: C.red, noteColor: C.redText },
  { label: "확인 필요", value: "3", note: "추가 정보 필요", dot: C.amber, noteColor: C.amberText },
];

const findings = [
  {
    no: 1,
    title: "스프링클러헤드 수평거리 초과",
    detail: "회의실 B · 최대 2.6m (기준 2.3m 이하)",
    basis: "NFTC 103 · 스프링클러설비",
    status: "부적합",
    tone: "red",
  },
  {
    no: 2,
    title: "소화기 보행거리 초과",
    detail: "복도 동측 · 23m (기준 20m 이내)",
    basis: "NFTC 101 · 소화기구",
    status: "부적합",
    tone: "red",
  },
  {
    no: 3,
    title: "피난구유도등 표기 누락",
    detail: "계단실 1 출입구 · 설치 위치 확인",
    basis: "NFTC 303 · 유도등",
    status: "확인 필요",
    tone: "amber",
  },
] as const;

// 평면도 좌표 (외벽: 284,288 ~ 756,680)
const interiorWalls = [
  [284, 460, 756, 460],
  [284, 520, 756, 520],
  [524, 288, 524, 460],
  [656, 288, 656, 460],
  [470, 520, 470, 680],
  [560, 520, 560, 680],
  [650, 520, 650, 680],
];

const doors = [
  { a: 440, b: 476, y: 460, up: true },
  { a: 534, b: 566, y: 460, up: true },
  { a: 684, b: 720, y: 460, up: true },
  { a: 380, b: 416, y: 520, up: false },
  { a: 525, b: 553, y: 520, up: false },
  { a: 615, b: 643, y: 520, up: false },
  { a: 700, b: 736, y: 520, up: false },
];

const rooms = [
  { label: "사무실 A", x: 292, y: 306 },
  { label: "회의실 B", x: 532, y: 306 },
  { label: "계단실 1", x: 664, y: 306 },
  { label: "복도", x: 292, y: 482 },
  { label: "사무실 C", x: 292, y: 538 },
  { label: "화장실", x: 478, y: 538 },
  { label: "탕비실", x: 568, y: 538 },
  { label: "계단실 2", x: 658, y: 538 },
];

const sprinklerHeads = [
  [324, 336], [404, 336], [484, 336],
  [324, 418], [404, 418], [484, 418],
  [590, 410],
  [344, 478], [464, 478], [584, 478], [704, 478],
  [330, 570], [424, 570], [330, 640], [424, 640],
  [515, 610], [605, 610],
];

const detectors = [
  [444, 378],
  [630, 440],
  [377, 605],
  [630, 655],
];

const extinguishers = [
  [298, 504],
  [452, 664],
];

const stairs = [
  { top: 318, bottom: 410, left: [668, 702], right: [710, 744], mid: 706 },
  { top: 568, bottom: 668, left: [662, 700], right: [708, 746], mid: 704 },
];

function Door({ a, b, y, up }: { a: number; b: number; y: number; up: boolean }) {
  const w = b - a;
  const leafEnd = up ? y - w : y + w;
  return (
    <g>
      <line x1={a} y1={y} x2={b} y2={y} stroke={C.plan} strokeWidth={5} />
      <line x1={a} y1={y} x2={a} y2={leafEnd} stroke={C.wallInner} strokeWidth={1.5} />
      <path
        d={`M ${a} ${leafEnd} A ${w} ${w} 0 0 ${up ? 1 : 0} ${b} ${y}`}
        fill="none"
        stroke={C.subtle}
        strokeWidth={1}
        strokeDasharray="3 3"
      />
    </g>
  );
}

function Stair({ top, bottom, left, right, mid }: (typeof stairs)[number]) {
  const treads = [];
  for (let y = top; y <= bottom; y += 10) {
    treads.push(
      <line key={`l${y}`} x1={left[0]} y1={y} x2={left[1]} y2={y} />,
      <line key={`r${y}`} x1={right[0]} y1={y} x2={right[1]} y2={y} />,
    );
  }
  return (
    <g stroke={C.stair} strokeWidth={1}>
      {treads}
      <line x1={mid} y1={top} x2={mid} y2={bottom} />
    </g>
  );
}

function Marker({ x, y, n, color }: { x: number; y: number; n: number; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={9} fill={color} opacity={0.5} className="motion-reduce:hidden">
        <animate attributeName="r" values="9;20" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.5;0" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx={x} cy={y} r={9} fill={color} stroke={C.plan} strokeWidth={2} />
      <text x={x} y={y} dy="0.35em" textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
        {n}
      </text>
    </g>
  );
}

function Sidebar() {
  return (
    <g>
      <rect x={0} y={0} width={210} height={800} fill={C.sidebar} />
      <line x1={210} y1={0} x2={210} y2={800} stroke={C.borderSoft} />

      <text x={28} y={52} fontSize={20} fontWeight={600} fill={C.text}>
        PlanWise
      </text>

      {sideNav.map((label, i) => {
        const y = 112 + i * 44;
        const active = i === ACTIVE_NAV;
        return (
          <g key={label}>
            {active && (
              <>
                <rect x={12} y={y - 26} width={186} height={40} rx={8} fill="#1a1a1a" stroke={C.border} />
                <rect x={12} y={y - 16} width={3} height={20} rx={1.5} fill={C.orange} />
              </>
            )}
            <text x={28} y={y} fontSize={14} fontWeight={active ? 600 : 400} fill={active ? C.text : C.muted}>
              {label}
            </text>
          </g>
        );
      })}

      <line x1={24} y1={318} x2={186} y2={318} stroke={C.borderSoft} />
      <text x={28} y={352} fontSize={14} fill={C.muted}>
        설정
      </text>

      <rect x={12} y={652} width={186} height={116} rx={10} fill={C.card} stroke={C.border} />
      <text x={26} y={680} fontSize={11} fill={C.subtle}>
        진행 중인 프로젝트
      </text>
      <text x={26} y={702} fontSize={13} fontWeight={500} fill={C.text}>
        성수동 근린생활시설 신축
      </text>
      <rect x={26} y={718} width={158} height={6} rx={3} fill={C.border} />
      <rect x={26} y={718} width={114} height={6} rx={3} fill={C.orange} />
      <text x={26} y={748} fontSize={11} fill={C.muted}>
        검토 진행률 72%
      </text>
    </g>
  );
}

function Header() {
  return (
    <g>
      <text x={240} y={46} fontSize={22} fontWeight={600} fill={C.text}>
        도면 검토
      </text>
      <text x={240} y={70} fontSize={13} fill={C.subtle}>
        성수동 근린생활시설 신축 · 3층 평면도 (A-103)
      </text>

      <rect x={922} y={29} width={110} height={30} rx={15} fill={C.green} fillOpacity={0.12} />
      <circle cx={940} cy={44} r={4} fill={C.green} />
      <text x={952} y={48.5} fontSize={12} fontWeight={500} fill={C.greenText}>
        AI 분석 완료
      </text>

      <rect x={1044} y={27} width={126} height={34} rx={8} fill={C.text} />
      <text x={1107} y={48.5} textAnchor="middle" fontSize={13} fontWeight={600} fill={C.frame}>
        리포트 내보내기
      </text>

      <line x1={210} y1={92} x2={1200} y2={92} stroke={C.borderSoft} />
    </g>
  );
}

function Stats() {
  return (
    <g>
      {stats.map((s, i) => {
        const x = 240 + i * 236;
        return (
          <g key={s.label}>
            <rect x={x} y={108} width={222} height={88} rx={12} fill={C.card} stroke={C.border} />
            <circle cx={x + 24} cy={132} r={4} fill={s.dot} />
            <text x={x + 36} y={136.5} fontSize={13} fill={C.muted}>
              {s.label}
            </text>
            <text x={x + 20} y={174} fontSize={28} fontWeight={600} fill={C.text}>
              {s.value}
            </text>
            <text x={x + 202} y={172} textAnchor="end" fontSize={12} fill={s.noteColor}>
              {s.note}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function FloorPlan() {
  return (
    <g>
      <rect x={240} y={216} width={558} height={554} rx={12} fill={C.card} stroke={C.border} />
      <text x={264} y={250} fontSize={16} fontWeight={600} fill={C.text}>
        평면도 분석
      </text>
      <text x={774} y={250} textAnchor="end" fontSize={12} fill={C.subtle}>
        3층 평면도 · 1:100
      </text>

      {/* 도면 영역 */}
      <rect x={264} y={268} width={510} height={432} rx={8} fill={C.plan} stroke={C.borderSoft} />
      <rect x={264} y={268} width={510} height={432} rx={8} fill="url(#pw-grid)" />

      {/* 계단 */}
      {stairs.map((s) => (
        <Stair key={s.top} {...s} />
      ))}

      {/* 벽체 */}
      <g stroke={C.wallInner} strokeWidth={2.5} strokeLinecap="square">
        {interiorWalls.map(([x1, y1, x2, y2]) => (
          <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
      <rect x={284} y={288} width={472} height={392} fill="none" stroke={C.wall} strokeWidth={4} />

      {/* 문 */}
      {doors.map((d) => (
        <Door key={`${d.a}-${d.y}`} {...d} />
      ))}

      {/* 실명 */}
      {rooms.map((r) => (
        <text key={r.label} x={r.x} y={r.y} fontSize={11} fill={C.subtle}>
          {r.label}
        </text>
      ))}

      {/* 소방시설 */}
      <g fill="none" stroke={C.muted} strokeWidth={1.2}>
        {sprinklerHeads.map(([x, y]) => (
          <circle key={`h${x}-${y}`} cx={x} cy={y} r={4} />
        ))}
      </g>
      <g fill="#404040" stroke={C.muted} strokeWidth={1}>
        {detectors.map(([x, y]) => (
          <rect key={`d${x}-${y}`} x={x - 3.5} y={y - 3.5} width={7} height={7} />
        ))}
      </g>
      <g fill={C.red}>
        {extinguishers.map(([x, y]) => (
          <rect key={`e${x}-${y}`} x={x - 3.5} y={y - 5} width={7} height={10} rx={2} />
        ))}
      </g>
      <rect x={711} y={511} width={14} height={5} rx={1} fill={C.green} />

      {/* ① 회의실 B: 헤드 수평거리 초과 */}
      <circle
        cx={590}
        cy={410}
        r={62}
        fill={C.red}
        fillOpacity={0.07}
        stroke={C.red}
        strokeWidth={1.2}
        strokeDasharray="4 4"
      />
      <line x1={590} y1={410} x2={648} y2={296} stroke={C.red} strokeWidth={1.2} strokeDasharray="3 3" />
      <text x={620} y={374} fontSize={10} fontWeight={600} fill={C.redText}>
        2.6m
      </text>
      <circle cx={590} cy={330} r={5} fill="none" stroke={C.orangeText} strokeWidth={1.5} strokeDasharray="2 2" />
      <text x={582} y={334} textAnchor="end" fontSize={10} fill={C.orangeText}>
        추가 제안
      </text>

      {/* ② 복도: 소화기 보행거리 초과 */}
      <line x1={304} y1={504} x2={744} y2={504} stroke={C.red} strokeWidth={1.5} strokeDasharray="5 4" />
      <text x={524} y={498} textAnchor="middle" fontSize={10} fontWeight={600} fill={C.redText}>
        보행거리 23m
      </text>

      {/* ③ 계단실 1 출입구: 유도등 표기 누락 */}
      <rect
        x={676}
        y={446}
        width={52}
        height={26}
        rx={4}
        fill={C.amber}
        fillOpacity={0.08}
        stroke={C.amber}
        strokeWidth={1.2}
        strokeDasharray="4 3"
      />

      <Marker x={642} y={304} n={1} color={C.red} />
      <Marker x={744} y={504} n={2} color={C.red} />
      <Marker x={740} y={436} n={3} color={C.amber} />

      {/* 범례 */}
      <g fontSize={11} fill={C.subtle}>
        <circle cx={270} cy={732} r={4} fill="none" stroke={C.muted} strokeWidth={1.2} />
        <text x={282} y={736}>스프링클러헤드</text>
        <rect x={384.5} y={728.5} width={7} height={7} fill="#404040" stroke={C.muted} />
        <text x={398} y={736}>감지기</text>
        <rect x={448} y={729.5} width={14} height={5} rx={1} fill={C.green} />
        <text x={468} y={736}>유도등</text>
        <rect x={518.5} y={727} width={7} height={10} rx={2} fill={C.red} />
        <text x={532} y={736}>소화기</text>
      </g>
    </g>
  );
}

function Findings() {
  return (
    <g>
      <rect x={812} y={216} width={358} height={554} rx={12} fill={C.card} stroke={C.border} />
      <text x={836} y={250} fontSize={16} fontWeight={600} fill={C.text}>
        검토 결과
      </text>
      <text x={1146} y={250} textAnchor="end" fontSize={12} fill={C.subtle}>
        총 9건
      </text>

      {findings.map((f, i) => {
        const y = 268 + i * 94;
        const tone = tones[f.tone];
        return (
          <g key={f.no}>
            <rect x={828} y={y} width={326} height={84} rx={10} fill={C.cardRaised} stroke={C.border} />
            <circle cx={850} cy={y + 24} r={9} fill={tone.solid} />
            <text x={850} y={y + 24} dy="0.35em" textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
              {f.no}
            </text>
            <text x={868} y={y + 29} fontSize={14} fontWeight={600} fill={C.text}>
              {f.title}
            </text>
            <rect x={1082} y={y + 13} width={60} height={22} rx={11} fill={tone.solid} fillOpacity={0.15} />
            <text x={1112} y={y + 28} textAnchor="middle" fontSize={11} fontWeight={600} fill={tone.text}>
              {f.status}
            </text>
            <text x={842} y={y + 54} fontSize={12} fill={C.muted}>
              {f.detail}
            </text>
            <text x={842} y={y + 72} fontSize={11} fill={C.subtle}>
              {f.basis}
            </text>
          </g>
        );
      })}

      {/* AI 가이드 */}
      <rect
        x={828}
        y={552}
        width={326}
        height={202}
        rx={10}
        fill={C.orange}
        fillOpacity={0.06}
        stroke={C.orange}
        strokeOpacity={0.35}
      />
      <text x={848} y={582} fontSize={13} fontWeight={600} fill={C.orangeText}>
        PlanWise 가이드
      </text>
      <circle cx={1132} cy={578} r={9} fill={C.red} />
      <text x={1132} y={578} dy="0.35em" textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff">
        1
      </text>
      <g fontSize={13} fill={C.body}>
        <text x={848} y={612}>회의실 B 북측에 헤드 1개를 추가하면</text>
        <text x={848} y={632}>실내 모든 지점이 수평거리 2.3m 이내로</text>
        <text x={848} y={652}>들어와 기준을 충족합니다.</text>
      </g>
      <text x={848} y={680} fontSize={11} fill={C.subtle}>
        근거 · NFTC 103 스프링클러설비
      </text>
      <rect x={848} y={698} width={100} height={34} rx={8} fill={C.text} />
      <text x={898} y={719.5} textAnchor="middle" fontSize={12} fontWeight={600} fill={C.frame}>
        수정안 보기
      </text>
      <rect x={958} y={698} width={88} height={34} rx={8} fill="none" stroke="#3f3f3f" />
      <text x={1002} y={719.5} textAnchor="middle" fontSize={12} fill={C.text}>
        다음 항목
      </text>
    </g>
  );
}

export function PlanReviewPreview({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1200 800"
      className={className}
      role="img"
      aria-label="PlanWise 도면 검토 화면 예시. 평면도에서 스프링클러헤드 수평거리 초과, 소화기 보행거리 초과, 피난구유도등 표기 누락을 찾아 표시하고 수정 가이드를 제공합니다."
    >
      <defs>
        <clipPath id="pw-frame">
          <rect width={1200} height={800} rx={16} />
        </clipPath>
        <pattern id="pw-grid" width={16} height={16} patternUnits="userSpaceOnUse">
          <path d="M 16 0 L 0 0 0 16" fill="none" stroke={C.grid} strokeWidth={1} />
        </pattern>
      </defs>

      <g clipPath="url(#pw-frame)">
        <rect width={1200} height={800} fill={C.frame} />
        <Sidebar />
        <Header />
        <Stats />
        <FloorPlan />
        <Findings />
      </g>
      <rect x={0.5} y={0.5} width={1199} height={799} rx={15.5} fill="none" stroke={C.border} />
    </svg>
  );
}
