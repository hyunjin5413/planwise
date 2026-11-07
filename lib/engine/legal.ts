/**
 * 법령 근거와 판정 기준값.
 *
 * 규칙은 조문 버전에 묶인다 (PRD: 규칙 구조). 같은 근거라도 기준일에 따라 조항 번호나
 * 내용이 다를 수 있으므로 effectiveFrom/effectiveTo로 버전을 고른다.
 *
 * 2026-11-07 국가법령정보센터 원문 대조 결과를 반영했다.
 * - effectiveFrom: 이 조항 내용(기준값·조항 번호)이 지금과 같아진 날
 * - checkedVersion: 대조에 쓴 현행 문서 버전
 * verified=false인 항목은 원문 대조를 마치지 못한 값이며, 화면과 리포트에 표시한다.
 */

export interface Citation {
  id: string;
  law: string;
  /** 짧은 이름 (예: NFTC 103) */
  short: string;
  article: string;
  title: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  checkedVersion: string;
  url?: string;
  verified: boolean;
  note?: string;
}

const LAW_DECREE = "https://www.law.go.kr/법령/소방시설설치및관리에관한법률시행령";
const adm = (seq: string) => `https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=${seq}`;

export const CITATIONS: Citation[] = [
  {
    id: "ENF-ATT4",
    law: "소방시설 설치 및 관리에 관한 법률 시행령",
    short: "소방시설법 시행령",
    article: "별표 4",
    title: "특정소방대상물의 규모·용도 및 수용인원 등을 고려하여 갖추어야 하는 소방시설의 종류",
    effectiveFrom: "2022-12-01",
    effectiveTo: null,
    checkedVersion: "2026.10.2 시행, 대통령령 제36728호",
    url: LAW_DECREE,
    verified: true,
    note: "근린생활시설·업무시설의 설치 기준값은 2022.12.1 이후 동일. 2026.3.1부터 지하주차장 관련 행(자동화재탐지설비 등)이 추가됨.",
  },
  {
    id: "NFTC101-ROOM",
    law: "소화기구 및 자동소화장치의 화재안전기술기준",
    short: "NFTC 101",
    article: "2.1.1.4.1",
    title: "각 층마다 설치, 2 이상의 거실로 구획된 경우 바닥면적 33㎡ 이상으로 구획된 각 거실에도 배치",
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
    checkedVersion: "2024.7.25 시행, 국립소방연구원공고 제2024-48호",
    url: adm("2100000244810"),
    verified: true,
  },
  {
    id: "NFTC101-ROOM",
    law: "소화기구 및 자동소화장치의 화재안전기술기준",
    short: "NFTC 101",
    article: "2.1.1.4.1",
    title: "각 층마다 설치, 2 이상의 거실로 구획된 경우 바닥면적 33㎡ 이상으로 구획된 각 거실(아파트는 각 세대)에도 배치",
    effectiveFrom: "2022-12-01",
    effectiveTo: "2023-12-31",
    checkedVersion: "2022.12.1 제정본",
    url: adm("2100000244810"),
    verified: true,
  },
  {
    id: "NFTC101",
    law: "소화기구 및 자동소화장치의 화재안전기술기준",
    short: "NFTC 101",
    article: "2.1.1.4.2",
    title: "각 부분으로부터 1개의 소화기까지 보행거리 소형소화기 20m 이내, 대형소화기 30m 이내",
    effectiveFrom: "2022-12-01",
    effectiveTo: null,
    checkedVersion: "2024.7.25 시행, 국립소방연구원공고 제2024-48호",
    url: adm("2100000244810"),
    verified: true,
  },
  {
    id: "NFTC103",
    law: "스프링클러설비의 화재안전기술기준",
    short: "NFTC 103",
    article: "2.7.3, 2.7.3.2",
    title: "천장·반자 각 부분으로부터 하나의 헤드까지 수평거리 2.1m 이하, 내화구조 2.3m 이하",
    effectiveFrom: "2026-03-01",
    effectiveTo: null,
    checkedVersion: "2026.7.1 시행, 국립소방연구원공고 제2026-35호",
    url: adm("2100000281674"),
    verified: true,
    note: "2026.3.1 조문 재구성 전에는 2.7.3.4에 규정",
  },
  {
    id: "NFTC103",
    law: "스프링클러설비의 화재안전기술기준",
    short: "NFTC 103",
    article: "2.7.3.4",
    title: "천장·반자 각 부분으로부터 하나의 헤드까지 수평거리 2.1m 이하, 내화구조 2.3m 이하",
    effectiveFrom: "2022-12-01",
    effectiveTo: "2026-02-28",
    checkedVersion: "2026.3.1 개정 전 조문",
    url: adm("2100000281674"),
    verified: true,
  },
  {
    id: "NFTC103-EXEMPT",
    law: "스프링클러설비의 화재안전기술기준",
    short: "NFTC 103",
    article: "헤드 설치 제외 규정",
    title: "헤드의 설치 제외 장소 (계단실, 승강기 승강로, 파이프덕트, 화장실 등)",
    effectiveFrom: "2022-12-01",
    effectiveTo: null,
    checkedVersion: "미대조",
    url: adm("2100000281674"),
    verified: false,
    note: "조항 번호와 제외 장소 목록은 원문 대조 전",
  },
  {
    id: "NFTC203-SMOKE",
    law: "자동화재탐지설비 및 시각경보장치의 화재안전기술기준",
    short: "NFTC 203",
    article: "2.4.2",
    title: "연기감지기 설치 장소: 계단·경사로, 복도(30m 미만 제외), 승강로·파이프피트·덕트 등",
    effectiveFrom: "2022-12-01",
    effectiveTo: null,
    checkedVersion: "2026.3.1 시행, 국립소방연구원공고 제2026-10호",
    url: adm("2100000275086"),
    verified: true,
  },
  {
    id: "NFTC203-CORRIDOR",
    law: "자동화재탐지설비 및 시각경보장치의 화재안전기술기준",
    short: "NFTC 203",
    article: "2.4.3.10.2",
    title: "복도·통로의 연기감지기는 보행거리 30m(3종 20m)마다 1개 이상",
    effectiveFrom: "2022-12-01",
    effectiveTo: null,
    checkedVersion: "2026.3.1 시행, 국립소방연구원공고 제2026-10호",
    url: adm("2100000275086"),
    verified: true,
  },
  {
    id: "NFTC203-EXEMPT",
    law: "자동화재탐지설비 및 시각경보장치의 화재안전기술기준",
    short: "NFTC 203",
    article: "2.4.5",
    title: "감지기 설치 제외: 목욕실·욕조나 샤워시설이 있는 화장실(2.4.5.5), 5㎡ 미만 파이프덕트(2.4.5.6) 등",
    effectiveFrom: "2022-12-01",
    effectiveTo: null,
    checkedVersion: "2026.3.1 시행, 국립소방연구원공고 제2026-10호",
    url: adm("2100000275086"),
    verified: true,
  },
  {
    id: "NFTC203-MCP",
    law: "자동화재탐지설비 및 시각경보장치의 화재안전기술기준",
    short: "NFTC 203",
    article: "2.6.1.2",
    title: "발신기: 층마다 설치, 각 부분으로부터 하나의 발신기까지 수평거리 25m 이하",
    effectiveFrom: "2022-12-01",
    effectiveTo: null,
    checkedVersion: "2026.3.1 시행, 국립소방연구원공고 제2026-10호",
    url: adm("2100000275086"),
    verified: true,
  },
  {
    id: "NFTC203-BELL",
    law: "자동화재탐지설비 및 시각경보장치의 화재안전기술기준",
    short: "NFTC 203",
    article: "2.5.1.3",
    title: "지구음향장치: 층마다 설치, 각 부분으로부터 하나의 음향장치까지 수평거리 25m 이하",
    effectiveFrom: "2022-12-01",
    effectiveTo: null,
    checkedVersion: "2026.3.1 시행, 국립소방연구원공고 제2026-10호",
    url: adm("2100000275086"),
    verified: true,
  },
  {
    id: "NFTC303-EXIT",
    law: "유도등 및 유도표지의 화재안전기술기준",
    short: "NFTC 303",
    article: "2.2.1",
    title: "피난구유도등 설치 장소: 옥내로부터 직접 지상으로 통하는 출입구, 직통계단·계단실 출입구 등",
    effectiveFrom: "2022-12-01",
    effectiveTo: null,
    checkedVersion: "2024.7.1 시행, 국립소방연구원공고 제2024-38호",
    url: adm("2100000243378"),
    verified: true,
  },
  {
    id: "NFTC303-EXIT-EXEMPT",
    law: "유도등 및 유도표지의 화재안전기술기준",
    short: "NFTC 303",
    article: "2.8.1.1",
    title: "바닥면적 1,000㎡ 미만 층으로서 옥내로부터 직접 지상으로 통하는 출입구(외부 식별이 쉬운 경우)는 피난구유도등 설치 제외",
    effectiveFrom: "2022-12-01",
    effectiveTo: null,
    checkedVersion: "2024.7.1 시행, 국립소방연구원공고 제2024-38호",
    url: adm("2100000243378"),
    verified: true,
  },
  {
    id: "NFTC303-CORRIDOR",
    law: "유도등 및 유도표지의 화재안전기술기준",
    short: "NFTC 303",
    article: "2.3.1.1.2, 2.8.2",
    title: "복도통로유도등: 구부러진 모퉁이 및 보행거리 20m마다 설치. 길이 30m 미만 직선 복도는 설치 제외",
    effectiveFrom: "2022-12-01",
    effectiveTo: null,
    checkedVersion: "2024.7.1 시행, 국립소방연구원공고 제2024-38호",
    url: adm("2100000243378"),
    verified: true,
  },
  {
    id: "BA-34-1",
    law: "건축법 시행령",
    short: "건축법 시행령",
    article: "제34조 제1항",
    title: "거실 각 부분으로부터 직통계단까지 보행거리 30m 이하 (주요구조부 내화구조·불연재료 50m)",
    effectiveFrom: "2020-10-08",
    effectiveTo: null,
    checkedVersion: "2026.10.6 시행, 대통령령 제36746호",
    url: "https://www.law.go.kr/법령/건축법시행령/제34조",
    verified: true,
  },
  {
    id: "BA-34-2",
    law: "건축법 시행령",
    short: "건축법 시행령",
    article: "제34조 제2항 제4호·제5호",
    title: "3층 이상 층으로서 거실 바닥면적 합계 400㎡ 이상, 지하층으로서 거실 바닥면적 합계 200㎡ 이상이면 직통계단 2개소 이상",
    effectiveFrom: "2017-02-03",
    effectiveTo: null,
    checkedVersion: "2026.10.6 시행, 대통령령 제36746호",
    url: "https://www.law.go.kr/법령/건축법시행령/제34조",
    verified: true,
  },
  {
    id: "EVAC-8",
    law: "건축물의 피난·방화구조 등의 기준에 관한 규칙",
    short: "피난·방화구조 규칙",
    article: "제8조 제2항 제1호",
    title: "가장 멀리 위치한 직통계단 2개소 출입구 간 가장 가까운 직선거리는 평면 최대 대각선 거리의 1/2 이상 (스프링클러 등 설치 시 1/3 이상)",
    effectiveFrom: "2019-08-06",
    effectiveTo: null,
    checkedVersion: "2026.10.6 시행, 국토교통부령 제1631호",
    url: "https://www.law.go.kr/법령/건축물의피난ㆍ방화구조등의기준에관한규칙/제8조",
    verified: true,
    note: "방화구획된 복도로 연결된 경우에는 보행거리로 산정 (MVP는 직선거리만 계산)",
  },
];

export function isInForce(c: { effectiveFrom: string; effectiveTo: string | null }, date: string): boolean {
  return c.effectiveFrom <= date && (c.effectiveTo === null || date <= c.effectiveTo);
}

/** 기준일에 시행 중인 조문 버전. 없으면 가장 이른 버전을 돌려주고 note에 표시한다. */
export function getCitation(id: string, date: string): Citation {
  const versions = CITATIONS.filter((c) => c.id === id);
  if (versions.length === 0) throw new Error(`unknown citation ${id}`);
  const hit = versions.find((c) => isInForce(c, date));
  if (hit) return hit;
  const earliest = [...versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
  return { ...earliest, verified: false, note: `기준일 ${date}에 시행 중인 버전이 등록되어 있지 않음` };
}

/** 지적 사항 근거 문구 */
export function citeText(c: Citation, date: string): string {
  const name = c.short.startsWith("NFTC") ? `${c.law}(${c.short})` : c.law;
  return `${name} ${c.article}, 기준일 ${date} 시행 조문`;
}

/** 판정 기준값. 규칙 버전마다 묶인다. */
export interface RuleParams {
  extinguisherWalkM: number;
  extinguisherRoomAreaM2: number;
  sprinklerRadiusFireResistantM: number;
  sprinklerRadiusOtherM: number;
  callPointRadiusM: number;
  bellRadiusM: number;
  /** 연기감지기 설치 대상 복도 최소 길이 (m) */
  smokeCorridorMinLengthM: number;
  /** 복도 연기감지기 간격 (m, 1·2종) */
  smokeCorridorSpacingM: number;
  corridorGuideSpacingM: number;
  /** 복도통로유도등 설치 제외: 이 길이 미만인 직선 복도 (m) */
  corridorGuideExemptLengthM: number;
  stairWalkM: number;
  stairWalkFireResistantM: number;
  twoStairsAreaM2: number;
  twoStairsBasementAreaM2: number;
  stairSeparationRatio: number;
  stairSeparationRatioSprinklered: number;
  /** 피난구유도등 설치 제외 대상 층 바닥면적 상한 (㎡, 외부 출입구) */
  exitSignExemptFloorAreaM2: number;
  /** 피난구유도등을 그 출입구의 것으로 볼 거리 (m). 도면 표기 위치 오차를 감안한 운영값 */
  exitSignNearDoorM: number;
}

export interface RuleSet {
  version: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  params: RuleParams;
}

/** NFTC가 시행된 2022.12.1 이전 기준일은 이 MVP의 규칙 범위 밖이다. */
export const RULE_SETS: RuleSet[] = [
  {
    version: "rules-2026.11.07",
    effectiveFrom: "2022-12-01",
    effectiveTo: null,
    params: {
      extinguisherWalkM: 20,
      extinguisherRoomAreaM2: 33,
      sprinklerRadiusFireResistantM: 2.3,
      sprinklerRadiusOtherM: 2.1,
      callPointRadiusM: 25,
      bellRadiusM: 25,
      smokeCorridorMinLengthM: 30,
      smokeCorridorSpacingM: 30,
      corridorGuideSpacingM: 20,
      corridorGuideExemptLengthM: 30,
      stairWalkM: 30,
      stairWalkFireResistantM: 50,
      twoStairsAreaM2: 400,
      twoStairsBasementAreaM2: 200,
      stairSeparationRatio: 1 / 2,
      stairSeparationRatioSprinklered: 1 / 3,
      exitSignExemptFloorAreaM2: 1000,
      exitSignNearDoorM: 2,
    },
  },
];

export function ruleSetFor(date: string): RuleSet | null {
  return RULE_SETS.find((r) => isInForce(r, date)) ?? null;
}

/** 시행령 별표 4 설치 대상 기준값 (근린생활시설·업무시설, 2022.12.1 이후 동일) */
export const REQUIREMENT_THRESHOLDS = {
  extinguisherTotalAreaM2: 33,
  hydrantTotalAreaM2: 1500,
  hydrantFloorAreaM2: 300,
  sprinklerMinFloors: 6,
  sprinklerFloorAreaM2: 1000,
  simpleSprinklerNeighborhoodAreaM2: 1000,
  fireDetectionNeighborhoodAreaM2: 600,
  fireDetectionOfficeAreaM2: 1000,
  fireDetectionMinFloors: 6,
  emergencyAlarmTotalAreaM2: 400,
  emergencyAlarmBasementAreaM2: 150,
  emergencyLightMinFloors: 5,
  emergencyLightTotalAreaM2: 3000,
  emergencyLightBasementAreaM2: 450,
  outdoorHydrantGround12AreaM2: 9000,
} as const;

export const DISCLAIMER = "검토 보조 결과이며 최종 판단은 소방기술사 등 자격자와 관할 소방서에 있습니다.";
