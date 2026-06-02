---
id: screen.CHANGE-ME
kind: Screen
title: CHANGE ME
purpose: ""            # [축①] 이 화면에서 사용자가 이루는 것
servesPersona: []      # [축①] → persona.*
realizedBy: []         # [축③] → component.* (이 화면을 렌더하는 FE 앱)
implementedIn: []      # [축③] 라우트/컴포넌트 파일 경로(provenance)
consumesApi: []        # [축③] 이 화면이 호출하는 endpoint (→ endpoint.* 또는 경로)
relatesTo: []          # [축②] 관련 capability/concept [{ to, type, note? }] — type 은 x-edge-types 표준 어휘(calls/leads-to 등)
impacts: []            # [축③] 개념적 파급
owner: TBD             # [축④]
lifecycle: active      # [축④]
confidence: unverified # [축④]
lastVerified: ""       # [축④]
---

<!-- 본문 섹션은 x-required-sections-by-kind.Screen 와 1:1 정렬. verify가 누락 섹션을 검사한다. -->

## 화면 목적
<!-- 이 화면(라우트)에서 사용자가 무엇을 하나 -->

## UI 요소 / 입력 필드
<!-- 주요 컴포넌트, 입력 폼 필드, 액션 버튼 -->

## 표시 데이터 / 호출 API
<!-- 어떤 데이터를 보여주고 어떤 endpoint 를 호출하나 -->

## 상태 / 엣지케이스
<!-- 로딩/빈/에러 상태, 권한 분기, 예외 흐름 -->

## 미확정 (OPEN)
- [ ] OPEN: 라우트 코드 정독해 UI 요소·필드·호출 API 채울 것
