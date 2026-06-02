---
id: concept.CHANGE-ME
kind: Concept
title: CHANGE ME
definition: ""         # [축②] 이 개념이 무엇인지 + 동의어
relatesTo: []          # [축②] [{ to: <id>, type: <관계>, note?: <설명> }] — type 은 x-edge-types 표준 어휘 사용
governedBy: []         # [축②] → invariant.*
implementedIn: []      # [축③] 이 개념이 실체화된 코드/DB 위치(provenance)
owner: TBD             # [축④]
lifecycle: active      # [축④]
confidence: unverified # [축④]
lastVerified: ""       # [축④]
---

<!-- 본문 섹션은 x-required-sections-by-kind.Concept 와 1:1 정렬. verify가 누락 섹션을 검사한다.
     섹션 제목(## 텍스트)을 바꾸면 누락으로 잡히므로 그대로 둔다. -->

## 정의
<!-- 이 도메인 용어의 의미 + 동의어(코드/DB에서의 다른 이름). relatesTo 로 거는 이웃 개념(포함/소유/참조)도 여기서 서술 -->

## 엔티티 (DB)
<!-- 이 개념을 실체화하는 테이블/컬럼/FK/제약 전체. 본문이 원본이 되도록 자기완결적으로 (§1b) -->

## API 표면
<!-- 이 개념을 읽고/바꾸는 endpoint. relatesTo:reads/mutates 로 거는 endpoint.* 와 정렬 -->

## 불변식
<!-- 이 개념에 걸린 깨면 안 되는 제약. governedBy 가 가리키는 invariant.* 서술 -->

## 구현 위치 (provenance)
<!-- implementedIn 경로 설명. 코드/DB가 사라져도 위 본문만으로 재현 가능해야 한다 -->

## 미확정 (OPEN)
- [ ] OPEN: definition 확정 필요
