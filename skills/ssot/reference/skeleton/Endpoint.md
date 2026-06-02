---
id: endpoint.CHANGE-ME
kind: Endpoint
title: CHANGE ME
definition: ""         # [축②] METHOD PATH + 한 줄 용도
realizedBy: []         # [축③] → component.* (이 endpoint 를 제공하는 BE)
implementedIn: []      # [축③] 컨트롤러/라우터 파일 경로(provenance)
relatesTo: []          # [축②] 관련 concept [{ to, type, note? }] — type 은 x-edge-types 표준 어휘(reads/mutates/backed-by 등)
governedBy: []         # [축②] → invariant.* (권한 등)
impacts: []            # [축③] 개념적 파급
consumedBy: []         # [축③] 이 endpoint 를 호출하는 screen/component
owner: TBD             # [축④]
lifecycle: active      # [축④]
confidence: unverified # [축④]
lastVerified: ""       # [축④]
---

<!-- 본문 섹션은 x-required-sections-by-kind.Endpoint 와 1:1 정렬. verify가 누락 섹션을 검사한다. -->

## 정의
<!-- METHOD PATH, 무엇을 하는 endpoint 인가 -->

## 요청 / 응답
<!-- 주요 요청 파라미터·바디, 응답 형태 -->

## 권한 / 제약
<!-- 필요 권한, 검증 규칙, 불변식(governedBy 가 가리키는 invariant.*) -->

## provenance
<!-- implementedIn 컨트롤러/라우터 경로 설명 + realizedBy(제공 BE 컴포넌트). 코드가 사라져도 위 본문만으로 재현 가능해야 한다 -->

## 미확정 (OPEN)
- [ ] OPEN: 컨트롤러/스펙 정독해 요청·응답·권한 채울 것
