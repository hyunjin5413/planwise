import * as z from "zod";

/** 모델이 돌려주는 사각형: 보낸 이미지의 픽셀 좌표 (좌상단 x1,y1 / 우하단 x2,y2) */
export const PixelBox = z.object({
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
});
export type PixelBox = z.infer<typeof PixelBox>;

export const DETECTABLE_KINDS = [
  "extinguisher",
  "indoor_hydrant",
  "sprinkler_head",
  "outdoor_hydrant",
  "smoke_detector",
  "heat_detector",
  "manual_call_point",
  "alarm_bell",
  "visual_alarm",
  "fire_receiver",
  "exit_sign",
  "corridor_guide_light",
  "emergency_light",
  "door",
  "stair",
  "window",
] as const;

/** 1차 분석: 도면 전체를 축소해 보고 시트 종류, 층, 축척, 실, 범례, 건물 정보를 읽는다 */
export const OverviewSchema = z.object({
  sheet_kind: z.enum(["floor_plan", "section", "system_diagram", "legend", "other"]),
  floor_label: z.string().nullable().describe('도면에 적힌 층 이름. 예: "3층", "지하1층". 모르면 null'),
  floor_level: z.number().int().nullable().describe("층 번호. 지하는 음수 (지하1층 = -1). 모르면 null"),
  title: z.string().nullable().describe("도면명"),
  scale_text: z.string().nullable().describe('표제란이나 도면 제목 아래의 축척 표기 그대로. 예: "1/100", "1:200"'),
  paper_size: z.string().nullable().describe('표제란에 적힌 용지 크기. 예: "A3", "A1". 없으면 null'),
  drawing_area: PixelBox.nullable().describe("평면도 본체(벽체, 치수선 포함)가 있는 영역. 표제란과 범례는 제외"),
  legend_area: PixelBox.nullable().describe("범례 표 영역. 없으면 null"),
  title_block_area: PixelBox.nullable(),
  dimension: z
    .object({
      value_mm: z.number().describe("치수선에 적힌 값 (mm)"),
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
    })
    .nullable()
    .describe("가장 긴 수평 또는 수직 전체 치수선 하나. 끝점은 치수 보조선(눈금)이 치수선과 만나는 점"),
  rooms: z
    .array(
      z.object({
        name: z.string().describe("실 이름 그대로. 이름이 없으면 용도를 추정해 적고 끝에 (추정)"),
        box: PixelBox.describe("벽 중심선 기준 실 경계"),
        area_m2: z.number().nullable().describe("도면에 적힌 면적. 없으면 null"),
      }),
    )
    .describe("평면도의 모든 실. 복도, 홀, 계단실, 화장실, 샤프트도 포함"),
  legend_entries: z
    .array(
      z.object({
        meaning: z.string().describe("범례에 적힌 이름 그대로"),
        symbol: z.string().describe("심볼 모양 설명. 예: 원 안에 X, 사각형 안에 S"),
        kind: z.enum(DETECTABLE_KINDS).nullable().describe("대응하는 객체 종류. 인식 대상이 아니면 null"),
      }),
    )
    .describe("범례 표의 모든 행"),
  building_hints: z.object({
    use: z.string().nullable().describe("공사명·도면명에서 읽은 건물 용도. 예: 근린생활시설"),
    floor_area_m2: z.number().nullable().describe("이 층 바닥면적이 적혀 있으면 그 값"),
    total_area_m2: z.number().nullable().describe("연면적이 적혀 있으면 그 값"),
    above_ground_floors: z.number().int().nullable(),
    basement_floors: z.number().int().nullable(),
    notes: z.array(z.string()).describe("판정에 도움이 될 메모 (구조, 용도 표기 등)"),
  }),
  tilt_degrees: z.number().nullable().describe("도면이 기울어진 각도 추정. 반듯하면 0"),
  quality_notes: z.array(z.string()).describe("흐림, 잘림, 촬영 왜곡 등 품질 문제"),
});
export type Overview = z.infer<typeof OverviewSchema>;

/** 2차 분석: 원본 해상도 타일에서 심볼과 건축 요소를 찾는다 */
export const TileSchema = z.object({
  objects: z.array(
    z.object({
      kind: z.enum(DETECTABLE_KINDS),
      box: PixelBox,
      confidence: z.number().describe("0~1. 범례와 모양이 확실히 일치하면 0.9 이상, 애매하면 0.5 미만"),
    }),
  ),
});
export type TileResult = z.infer<typeof TileSchema>;

/** 가이드 문장 다듬기 */
export const GuideSchema = z.object({
  guide: z.string().describe("수정 가이드 2~3문장. 마지막 문장은 '근거: …'로 끝맺는다"),
});
