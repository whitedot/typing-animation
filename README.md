# Typing Animation Guide

`typing-animation-lib.js` 기반 타이핑 애니메이션 데모/가이드 프로젝트입니다.  
Tailwind UI와 함께 타이핑 시나리오를 실시간으로 검증할 수 있습니다.

## 주요 기능

- `plain`, `ime-ko`, `instant` 타이핑 전략 지원
- 시작 조건: `immediate`, `in-view`, `interaction`
- 재생 정책: `replay.mode`, `cooldownMs`, `manualReplayAllowed`
- 접근성: `reducedMotionBehavior`, `a11y.skipEnabled`, `skipKey`
- 라인 폭 고정 제어: `lockLineWidth` / `lines[].lockWidth`
- 시작 전 커서 대기: `preStartCursorBlinkMs`
- 데모 콘솔에서 실시간 조정
  - 글자 크기/색상/커서 색
  - 타이핑 속도
  - 시작 전 커서 대기
  - 라인 폭 고정 여부
  - 타이핑 문구(최대 3줄)
  - 타이핑 후 문구
  - 배지 문구

## 빠른 실행

1. 프로젝트 루트에서 `index.html`을 브라우저로 엽니다.
2. 프리셋 버튼으로 시나리오를 변경합니다.
3. `LIVE CONTROL CONSOLE`에서 문구/속도/스타일을 조정합니다.

## 파일 구조

- `index.html`
  - 데모 UI
  - 프리셋/플레이어 제어 스크립트
  - 라이브 콘솔(미리보기/런타임 설정)
- `typing-animation-lib.js`
  - 타이핑 엔진 본체
  - 전략 실행기(plain, ime-ko, instant)
  - 재생 상태/트리거/리플레이 정책

## 라이브러리 사용 예시

```html
<script src="./typing-animation-lib.js"></script>
<script>
  const player = window.TypingAnimationLib.create({
    lockLineWidth: false,
    preStartCursorBlinkMs: 300,
    replay: {
      mode: "once",
      cooldownMs: 800,
      manualReplayAllowed: true
    },
    lines: [
      {
        containerId: "hero-typed",
        trackId: "hero-typed-track",
        text: "첫 번째 문장",
        strategy: "plain",
        delayBefore: 150,
        delayAfter: 250
      },
      {
        containerId: "hero-typed-second",
        trackId: "hero-typed-second-track",
        text: "두 번째 문장",
        strategy: "ime-ko",
        activateClass: "is-active",
        delayAfter: 600
      }
    ]
  });
  
  // 필요 시 수동 제어
  // player.play();
  // player.pause();
  // player.resume();
  // player.skip();
</script>
```

## 핵심 옵션 요약

- Top-level
  - `lockLineWidth`: 라인 컨테이너 폭 고정 여부
  - `preStartCursorBlinkMs`: 첫 타이핑 전 커서 대기(ms)
  - `startTrigger`, `startTriggerTarget`, `startTriggerEvent`: 시작 조건
  - `replay.mode`, `replay.cooldownMs`, `replay.manualReplayAllowed`: 재생 정책
  - `debug`: 잘못된 selector/id 구성 디버그 로그 출력
- `lines[]`
  - `text`: 라인별 출력 문구
  - `strategy`: `plain | ime-ko | instant`
  - `delayBefore`, `delayAfter`: 라인 전/후 지연
  - `activateClass`: 라인 시작 시 적용 클래스
  - `lockWidth`: 라인 단위 폭 고정 override

## 참고

- 데모의 `LIVE CONTROL CONSOLE`은 `index.html` 전용 UX 레이어입니다.
- 엔진 자체 옵션 문서와 데모 가이드는 페이지 내 "예제 변수 사용 가이드" 섹션에도 반영되어 있습니다.
