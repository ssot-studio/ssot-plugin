---
id: component.CHANGE-ME
kind: SystemComponent
title: CHANGE ME
purpose: ""            # [축①] 이 시스템 단위의 책임
realizedBy: []         # [축③] 이 컴포넌트가 실현하는 capability/domain id (역참조 보조)
implementedIn: []      # [축③] 레포/디렉토리 경로
dependsOn: []          # [축③] → component.* (의존 대상)
consumesApi: []        # [축③] 호출하는 API 엔트리 (경로 또는 정합성 문서 링크)
providesApi: []        # [축③] 제공하는 API 엔트리
integratesWith: []     # [축③] → integration.*
impacts: []            # [축③] 개념적 파급
owner: TBD             # [축④]
lifecycle: active      # [축④]
confidence: unverified # [축④]
lastVerified: ""       # [축④]
---

<!-- 작성 고도(methodology §0): 비개발자도 읽는 자연어로 — 무엇을·왜·누가·어떤 규칙·무슨 데이터. 코드(테이블·필드·경로·SQL) 옮겨적기 금지(식별자는 provenance/근거에만). 코드 분기/의도 불명은 판정 말고 OPEN. -->

<!-- 본문 섹션은 x-required-sections-by-kind.SystemComponent 와 1:1 정렬. verify가 누락 섹션을 검사한다.
     (schema enum kind 는 SystemComponent. 설계 표기 'Component' 와 동일 대상) -->

## 책임
<!-- 이 컴포넌트(FE 앱/BE 서비스/외부 시스템)가 맡는 것 -->

## 경계와 의존
<!-- dependsOn / consumesApi / providesApi 설명. 어느 레포·런타임인지 -->

## 통신 패턴
<!-- 외부와 어떻게 통신하나(REST/MF/이벤트/배치 등). integratesWith/exposes/feeds 엣지로 정렬 -->

## 하위 서브패키지 (책임 단위)
<!-- 이 컴포넌트를 구성하는 하위 모듈/패키지와 각자의 책임. contains 엣지로 정렬 -->

## 미확정 (OPEN)
- [ ] OPEN: 의존/호출 관계 확인 필요
