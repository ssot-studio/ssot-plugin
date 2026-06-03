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

<!-- 본문 섹션은 x-required-sections-by-kind.Endpoint 와 1:1 정렬. verify가 누락 섹션을 검사한다.
     고도(methodology §0): 비개발자도 읽는 자연어로. 코드 옮겨적기 금지 — 필드명·타입·DTO·SQL은 본문 주체가 아니라 provenance/근거. -->

## 정의
<!-- 무슨 기능인가 + 누가/언제 쓰나(자연어). METHOD PATH 는 한 줄 식별용으로만. -->

## 요청 / 응답
<!-- 주고받는 데이터를 *자연어 의미*로: 무슨 정보를 보내고(예: "검색어·페이지·프로젝트 범위") 무슨 정보를 돌려주나(예: "에이전트 목록 — 각 항목은 이름·유형·내 역할·등록상태를 가짐").
     DTO 통째 복사·필드명/타입 나열 금지(구현 형태는 개발 시점 결정). 대표 항목의 의미만. -->

## 권한 / 제약
<!-- 누가 호출할 수 있나(권한), 어떤 조건·기본값·예외·제약이 적용되나. 불변식은 governedBy 가 가리키는 invariant.* -->

## provenance
<!-- implementedIn 컨트롤러/라우터 경로 + realizedBy(제공 BE 컴포넌트). 코드가 사라져도 위 본문(정책·데이터 의미)만으로 재기획·재구현 가능해야 한다(코드 구조 복사가 아니라 의미 보존) -->

## 미확정 (OPEN)
- [ ] OPEN: 컨트롤러/서비스/매퍼를 정독해 기능·권한·**주고받는 데이터의 의미**를 자연어로 채울 것 (코드 옮겨적기 아님). 코드가 분기마다 다르거나 의도 불명이면 "확인 필요"로 남기고 판정은 owner 에게.
