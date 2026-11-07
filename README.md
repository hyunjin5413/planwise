# PlanWise

도면 이미지를 올리면 소방시설과 피난 요소를 찾아 도면 위에 표시하고, 소방 관련 법령·화재안전기준에 맞는지 근거 조문과 수정 가이드를 함께 보여주는 검토 보조 서비스입니다. 요구사항은 [`app/dashboard/prd.md`](app/dashboard/prd.md)에 있습니다.

> 검토 보조 결과이며 최종 판단은 소방기술사 등 자격자와 관할 소방서에 있습니다.

## 시작하기

```bash
npm install          # postinstall이 pdf.js 워커를 public/에 복사합니다
cp .env.example .env.local   # ANTHROPIC_API_KEY 입력
npm run dev          # http://localhost:3000
```

API 키가 없어도 대시보드의 **샘플 프로젝트로 체험하기**와 **수동 입력**(박스를 직접 그림)으로 전체 흐름을 쓸 수 있습니다.
| 스크립트 | 내용 |
| --- | --- |
| `npm test` | 규칙 엔진·분석 파이프라인 단위 테스트 (API 호출 없음) |
| `PLANWISE_EVAL=1 npx vitest run tests/eval.live.test.ts` | 실제 Claude로 샘플 도면을 분석해 PRD 성공 지표 측정 (API 비용 발생) |
| `node scripts/e2e/sample-flow.mjs http://localhost:3000 out/` | 샘플 프로젝트 E2E (로컬 Chrome 사용) |
| `node scripts/e2e/upload-flow.mjs http://localhost:3000 out/` | 업로드 → 두 점 축척 보정 → 건물 정보 → 결과 E2E |
| `npm run samples` | 합성 샘플 도면과 정답 데이터 다시 생성 |

## 구조

```
app/
  page.tsx                       랜딩 페이지
  dashboard/                     대시보드 (프로젝트 목록, 작업 화면, 리포트)
  api/analyze                    도면 분석 (Claude 비전, 타일 분할)
  api/guide                      수정 가이드 문장 다듬기 (근거 검증)
  api/convert                    TIFF → PNG
  api/status                     AI 키 유효성
lib/
  domain/                        객체 카탈로그, 타입
  engine/                        규칙 엔진 (결정적 판정)
    legal.ts                     법령 근거·기준값 (기준일별 버전)
    requirements.ts              시행령 별표 4 설치 대상 판정
    review.ts                    집계, 배치 기준, 피난 요소 판정
  ai/                            Claude 호출 (서버 전용)
  client/, storage/              업로드 처리, IndexedDB 저장
components/dashboard/            작업 화면 UI
public/samples/                  합성 샘플 도면(A3·1:100·300dpi)과 정답 데이터
```

## 설계 원칙

- **판정은 규칙 엔진이 결정적으로 한다.** 같은 도면·기준일·규칙 버전이면 같은 결과입니다. LLM은 도면 인식과 설명 문장에만 쓰고, 설명 문장에 근거에 없는 수치가 있으면 버리고 규칙 엔진 문장을 씁니다.
- **불확실한 값은 사람이 확인한다.** 축척(표제란 축척과 치수선이 10% 넘게 다르면 보정 요청)과 건물 정보는 확인 단계를 거쳐야 판정에 쓰입니다. 축척이 없으면 거리 판정은 "판정 보류"입니다.
- **조문은 기준일로 고른다.** `lib/engine/legal.ts`의 각 근거는 시행 기간과 원문 대조 버전을 가집니다(2026-11-07 국가법령정보센터 대조).
- **도면은 사용자 브라우저에 저장한다.** 프로젝트와 도면 이미지는 IndexedDB에 있고, 분석할 때만 서버를 거쳐 Claude로 전송됩니다(서버에 저장하지 않음).

## 현재 범위 (MVP)

근린생활시설·업무시설 평면도. 소화기·옥내소화전·스프링클러 헤드·감지기·발신기·경종·시각경보기·수신기·유도등·비상조명등과 실·출입문·계단·창호를 인식하고, 설치 대상(별표 4), 누락, 실별 설치 여부, 헤드 수평거리, 소화기 보행거리, 발신기·경종 수평거리, 복도 감지기·통로유도등 간격, 피난구유도등, 직통계단 개수·보행거리·이격 거리를 판정합니다.
