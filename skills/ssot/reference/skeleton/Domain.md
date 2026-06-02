---
id: domain.CHANGE-ME
kind: Domain
title: CHANGE ME
purpose: ""            # [축①] 이 도메인이 책임지는 비즈니스 영역
definition: ""         # [축②] 도메인 경계 (무엇이 포함/제외)
servesPersona: []      # [축①] → persona.*
relatesTo: []          # [축②] [{ to: <id>, type: <관계>, note?: <설명> }]
governedBy: []         # [축②] → invariant.*
realizedBy: []         # [축③] → component.*
impacts: []            # [축③] 개념적 파급 → 임의 id
owner: TBD             # [축④]
lifecycle: active      # [축④]
confidence: unverified # [축④]
lastVerified: ""       # [축④]
---

<!-- 본문 섹션은 x-required-sections-by-kind.Domain 와 1:1 정렬. verify가 누락 섹션을 검사한다. -->

## 목적
<!-- 이 도메인이 책임지는 것 -->

## 경계와 핵심 개념
<!-- 포함되는 Concept(belongs-to/contains), 제외되는 것 -->

## 기능
<!-- 이 도메인이 제공하는 capability 목록. realizedBy 가 가리키는 component 와 정렬 -->

## 시스템 흐름
<!-- 주요 동작의 흐름(요청→처리→저장). leads-to/feeds 엣지로 추적되는 시퀀스를 서술 -->

## 다른 도메인과의 관계
<!-- relatesTo 서술 — type 은 x-edge-types 표준 어휘 사용 -->

## 미확정 (OPEN)
- [ ] OPEN: definition(경계) 확정 필요
