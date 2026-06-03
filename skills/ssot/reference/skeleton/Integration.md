---
id: integration.CHANGE-ME
kind: Integration
title: CHANGE ME
purpose: ""            # [축①] 이 외부 연동이 필요한 이유
definition: ""         # [축②] 무엇과 연동하나 (외부 시스템/프로토콜)
integratesWith: []     # [축③] → component.* (이 연동을 사용하는 내부 컴포넌트)
implementedIn: []      # [축③] 이 연동이 구현된 코드 위치(provenance)
impacts: []            # [축③] 이 연동 도입/변경이 파급하는 대상 id (개념/불변식/화면)
relatesTo: []          # [축②] 관련 개념 [{ to, type, note? }] — type 은 x-edge-types 표준 어휘 사용
governedBy: []         # [축②] → invariant.* (연동에 걸린 제약)
owner: TBD             # [축④]
lifecycle: proposed    # [축④] 신규 연동 검토 시 proposed로 시작
confidence: unverified # [축④]
lastVerified: ""       # [축④]
---

<!-- 작성 고도(methodology §0): 비개발자도 읽는 자연어로 — 무엇을·왜·누가·어떤 규칙·무슨 데이터. 코드(테이블·필드·경로·SQL) 옮겨적기 금지(식별자는 provenance/근거에만). 코드 분기/의도 불명은 판정 말고 OPEN. -->

<!-- 본문 섹션은 x-required-sections-by-kind.Integration 와 1:1 정렬. verify가 누락 섹션을 검사한다. -->

## 무엇과 연동하나
<!-- 외부 시스템, 인증 방식, 프로토콜 -->

## 구현 위치 (provenance)
<!-- implementedIn 경로 설명 + integratesWith(사용하는 내부 컴포넌트). 코드가 사라져도 본문만으로 재현 가능해야 한다 -->

## 불변식
<!-- 이 연동에 걸린 깨면 안 되는 제약(인증/만료/레이트리밋 등). governedBy 가 가리키는 invariant.* -->

## 영향 범위
<!-- impacts: 이 연동이 닿는 개념·권한·화면·불변식. 영향분석의 출발점 -->

## 미확정 (OPEN)
- [ ] OPEN: 영향 대상(impacts) 확정 필요
