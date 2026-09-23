import React, { useEffect, useRef, useState, useCallback } from "react";

/* =========================================================================
   PRO 마스코트 컴포넌트
   - export default Mascot          : 화면에 떠다니는 마스코트 본체 (App.jsx 최상단에 배치)
   - export MascotSettings          : 관리자설정 페이지에 넣는 설정 카드
   - 설정값은 localStorage 에 저장됩니다 (브라우저별 개인 설정)
   - 이미지 파일은 public/mascot.gif 에 두십시오
   ========================================================================= */

const STORAGE_KEY = "pro:mascot:v1";
const EVT = "pro-mascot-settings";

const DEFAULTS = {
  show: true,          // 마스코트 표시 여부
  avoid: true,         // 마우스가 가까우면 피하기
  variant: "walk",     // "walk" = 걸어다님 / "corner" = 우측 하단 고정
  size: 72,            // 캐릭터 크기(px)
  speed: 0.55,         // 걷는 속도
  bottomGap: 24,       // 화면 아래에서 띄울 높이(px) — 하단 고정바가 있으면 늘리십시오
  src: "/mascot.gif",  // 이미지 경로 (public 폴더 기준)
};

const LINES = [
  "오늘도 화이팅입니다",
  "순위 체크 하셨나요?",
  "갱신 임박 계약 확인해보세요",
  "물 한 잔 드시고 하세요",
  "계약 하나만 더!",
  "잠깐 쉬었다 하시죠",
  "메모 확인 부탁드려요",
  "이번 주도 절반 왔습니다",
];

/* ---------- 설정 읽기 / 쓰기 ---------- */
export function loadMascotSettings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export function saveMascotSettings(next) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    /* 저장 실패해도 화면 동작에는 영향 없음 */
  }
  window.dispatchEvent(new CustomEvent(EVT, { detail: next }));
}

/* ---------- 애니메이션 키프레임 1회 주입 ---------- */
function injectKeyframes() {
  if (typeof document === "undefined") return;
  if (document.getElementById("pro-mascot-style")) return;
  const el = document.createElement("style");
  el.id = "pro-mascot-style";
  el.textContent = `
@keyframes proMascotBob {
  0%,100% { transform: translateY(0) rotate(-1.5deg); }
  50%     { transform: translateY(-4px) rotate(1.5deg); }
}
@keyframes proMascotIdle {
  0%,100% { transform: translateY(0); }
  50%     { transform: translateY(-5px); }
}
@keyframes proMascotPop {
  0%   { transform: scale(0.4) translateY(6px); }
  100% { transform: scale(1) translateY(0); }
}
`;
  document.head.appendChild(el);
}

/* =========================================================================
   본체
   ========================================================================= */
export default function Mascot() {
  const [cfg, setCfg] = useState(loadMascotSettings);
  const [bubble, setBubble] = useState("");
  const [fleeing, setFleeing] = useState(false);
  const [mobile, setMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 820 : false
  );

  const petRef = useRef(null);
  const bodyRef = useRef(null);
  const cornerRef = useRef(null);
  const bubbleTimer = useRef(null);

  const st = useRef({
    x: 180,
    y: 0,
    dir: 1,
    vy: 0,
    mode: "walk",
    timer: 0,
    fleeHold: 0,
    dragging: false,
    moved: false,
    ox: 0,
    oy: 0,
  });
  const mouse = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    injectKeyframes();
  }, []);

  /* 설정 변경 실시간 반영 */
  useEffect(() => {
    const onEvt = (e) => {
      setCfg(e.detail ? { ...DEFAULTS, ...e.detail } : loadMascotSettings());
    };
    const onResize = () => setMobile(window.innerWidth < 820);
    window.addEventListener(EVT, onEvt);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener(EVT, onEvt);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  /* 마우스 위치 추적 */
  useEffect(() => {
    const onMove = (e) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
    };
    const onLeave = () => {
      mouse.current.x = -9999;
      mouse.current.y = -9999;
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  const say = useCallback((text) => {
    setBubble(text);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(""), 2300);
  }, []);

  useEffect(() => {
    return () => {
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    };
  }, []);

  const active = cfg.show && !mobile;
  const isWalk = active && cfg.variant === "walk";
  const isCorner = active && cfg.variant === "corner";

  /* ---------- 걸어다니기 + 마우스 피하기 ---------- */
  useEffect(() => {
    if (!isWalk) return undefined;

    const W = cfg.size;
    const H = cfg.size;
    const AVOID_RADIUS = Math.max(90, cfg.size * 1.5);
    const FLEE_SPEED = 2.4;
    let raf = 0;
    let alive = true;

    const floorY = () => window.innerHeight - H - cfg.bottomGap;

    const setMode = (m) => {
      st.current.mode = m;
      st.current.timer = m === "walk" ? 240 + Math.random() * 380 : 120 + Math.random() * 240;
      setFleeing(m === "flee");
    };

    if (st.current.y === 0) st.current.y = floorY();
    setMode("walk");

    const loop = () => {
      if (!alive) return;
      const s = st.current;

      if (!s.dragging) {
        const cx = s.x + W / 2;
        const cy = s.y + H / 2;

        /* 마우스 피하기 */
        if (cfg.avoid) {
          const dx = cx - mouse.current.x;
          const dy = cy - mouse.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < AVOID_RADIUS) {
            s.dir = dx >= 0 ? 1 : -1;
            const atEdge =
              (s.dir === 1 && s.x > window.innerWidth - W - 8) || (s.dir === -1 && s.x < 8);
            if (s.mode !== "flee") setMode("flee");
            s.fleeHold = 45;
            if (atEdge) {
              if (s.y >= floorY()) s.vy = -5.2;
            } else {
              s.x += s.dir * FLEE_SPEED;
            }
          } else if (s.mode === "flee") {
            s.fleeHold -= 1;
            if (s.fleeHold <= 0) setMode("walk");
          }
        }

        /* 평소 이동 */
        if (s.mode === "walk") {
          s.x += s.dir * cfg.speed;
          if (s.x < 6) {
            s.x = 6;
            s.dir = 1;
          }
          if (s.x > window.innerWidth - W - 6) {
            s.x = window.innerWidth - W - 6;
            s.dir = -1;
          }
        }
        s.x = Math.max(2, Math.min(window.innerWidth - W - 2, s.x));

        /* 중력 */
        if (s.y < floorY() || s.vy < 0) {
          s.vy += 0.55;
          s.y += s.vy;
          if (s.y >= floorY()) {
            s.y = floorY();
            s.vy = 0;
            if (s.mode === "fall") setMode("idle");
          }
        }

        /* 상태 자동 전환 */
        if (s.mode === "walk" || s.mode === "idle") {
          s.timer -= 1;
          if (s.timer <= 0) {
            if (s.mode === "walk") {
              setMode("idle");
            } else {
              s.dir = Math.random() < 0.5 ? -1 : 1;
              setMode("walk");
            }
          }
        }
      }

      if (petRef.current) {
        petRef.current.style.left = s.x + "px";
        petRef.current.style.top = s.y + "px";
      }
      if (bodyRef.current) {
        const flip = s.dir === -1 ? "scaleX(-1)" : "scaleX(1)";
        bodyRef.current.style.transform = flip;
        bodyRef.current.style.animation =
          s.mode === "walk"
            ? "proMascotBob 0.42s infinite ease-in-out"
            : s.mode === "flee"
            ? "proMascotBob 0.2s infinite ease-in-out"
            : "none";
      }

      raf = window.requestAnimationFrame(loop);
    };

    raf = window.requestAnimationFrame(loop);

    const onResize = () => {
      st.current.x = Math.min(st.current.x, window.innerWidth - W - 6);
      st.current.y = Math.min(st.current.y, floorY());
    };
    window.addEventListener("resize", onResize);

    return () => {
      alive = false;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [isWalk, cfg.size, cfg.speed, cfg.avoid, cfg.bottomGap]);

  /* ---------- 구석 고정: 마우스 가까우면 흐려지기 + 가끔 말풍선 ---------- */
  useEffect(() => {
    if (!isCorner) return undefined;
    let raf = 0;
    let alive = true;

    const loop = () => {
      if (!alive) return;
      if (cornerRef.current) {
        if (cfg.avoid) {
          const r = cornerRef.current.getBoundingClientRect();
          const dx = r.left + r.width / 2 - mouse.current.x;
          const dy = r.top + r.height / 2 - mouse.current.y;
          const near = Math.sqrt(dx * dx + dy * dy) < 140;
          cornerRef.current.style.opacity = near ? "0.25" : "1";
        } else {
          cornerRef.current.style.opacity = "1";
        }
      }
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);

    const iv = setInterval(() => {
      if (Math.random() < 0.45) say(LINES[Math.floor(Math.random() * LINES.length)]);
    }, 9000);

    return () => {
      alive = false;
      window.cancelAnimationFrame(raf);
      clearInterval(iv);
    };
  }, [isCorner, cfg.avoid, say]);

  /* ---------- 드래그 & 클릭 (걸어다님 전용) ---------- */
  const onPointerDown = (e) => {
    const s = st.current;
    s.dragging = true;
    s.moved = false;
    s.ox = e.clientX - s.x;
    s.oy = e.clientY - s.y;
    if (petRef.current && petRef.current.setPointerCapture) {
      petRef.current.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e) => {
    const s = st.current;
    if (!s.dragging) return;
    const nx = e.clientX - s.ox;
    const ny = e.clientY - s.oy;
    if (Math.abs(nx - s.x) > 2 || Math.abs(ny - s.y) > 2) s.moved = true;
    s.x = Math.max(0, Math.min(window.innerWidth - cfg.size, nx));
    s.y = Math.max(0, Math.min(window.innerHeight - cfg.size - cfg.bottomGap, ny));
  };

  const onPointerUp = () => {
    const s = st.current;
    if (!s.dragging) return;
    s.dragging = false;
    if (!s.moved) {
      say(LINES[Math.floor(Math.random() * LINES.length)]);
      s.vy = -7;
      s.mode = "fall";
    } else {
      s.vy = 0;
      s.mode = "fall";
    }
  };

  if (!active) return null;

  const imgStyle = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    objectPosition: "bottom center",
    pointerEvents: "none",
    userSelect: "none",
    WebkitUserDrag: "none",
    display: "block",
  };

  const bubbleNode = bubble ? (
    <div
      style={{
        position: "absolute",
        bottom: cfg.size + 8,
        left: "50%",
        transform: "translateX(-50%)",
        background: "#fff",
        border: "1px solid #e6eaf2",
        borderRadius: 12,
        padding: "8px 12px",
        fontSize: 12.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
        color: "#1f2430",
        boxShadow: "0 6px 20px rgba(20,30,60,.14)",
        pointerEvents: "none",
      }}
    >
      {bubble}
    </div>
  ) : null;

  /* 우측 하단 고정 */
  if (isCorner) {
    return (
      <div
        ref={cornerRef}
        onClick={() => say(LINES[Math.floor(Math.random() * LINES.length)])}
        style={{
          position: "fixed",
          right: 26,
          bottom: cfg.bottomGap,
          width: cfg.size,
          height: cfg.size,
          zIndex: 40,
          cursor: "pointer",
          transition: "opacity .2s",
        }}
        title="마스코트"
      >
        {bubbleNode}
        <div style={{ width: "100%", height: "100%", animation: "proMascotIdle 2.2s infinite ease-in-out" }}>
          <img src={cfg.src} alt="" style={imgStyle} draggable={false} />
        </div>
      </div>
    );
  }

  /* 걸어다님 */
  return (
    <div
      ref={petRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: cfg.size,
        height: cfg.size,
        zIndex: 40,
        cursor: "grab",
        touchAction: "none",
        userSelect: "none",
      }}
      title="마스코트"
    >
      {bubbleNode}
      {fleeing ? (
        <div
          style={{
            position: "absolute",
            top: -16,
            left: "50%",
            marginLeft: -4,
            fontSize: 17,
            fontWeight: 900,
            color: "#ff5a7a",
            animation: "proMascotPop .3s ease-out",
            pointerEvents: "none",
          }}
        >
          !
        </div>
      ) : null}
      <div ref={bodyRef} style={{ width: "100%", height: "100%", transformOrigin: "50% 100%" }}>
        <img src={cfg.src} alt="" style={imgStyle} draggable={false} />
      </div>
    </div>
  );
}

/* =========================================================================
   관리자설정 페이지용 설정 카드
   ========================================================================= */
export function MascotSettings() {
  const [cfg, setCfg] = useState(loadMascotSettings);

  const update = (patch) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    saveMascotSettings(next);
  };

  const Toggle = ({ on, onClick, label }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        position: "relative",
        width: 44,
        height: 25,
        borderRadius: 999,
        border: 0,
        padding: 0,
        flex: "none",
        cursor: "pointer",
        background: on ? "#0071CE" : "#d8dee9",
        transition: ".18s",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 22 : 3,
          width: 19,
          height: 19,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 3px rgba(0,0,0,.2)",
          transition: ".18s",
        }}
      />
    </button>
  );

  const rowStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 0",
    borderTop: "1px solid #f1f3f8",
    fontSize: 14,
    fontWeight: 600,
    color: "#1f2430",
  };

  const descStyle = { fontSize: 12, fontWeight: 500, color: "#7b8494", marginTop: 3 };

  const segBtn = (on) => ({
    flex: 1,
    fontFamily: "inherit",
    fontSize: 13,
    fontWeight: 700,
    padding: "9px 0",
    borderRadius: 9,
    cursor: "pointer",
    border: on ? "1px solid #0071CE" : "1px solid #e6eaf2",
    background: on ? "#0071CE" : "#f6f8fc",
    color: on ? "#fff" : "#1f2430",
  });

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e6eaf2",
        borderRadius: 14,
        padding: "18px 20px",
        marginBottom: 14,
      }}
    >
      <h3 style={{ margin: "0 0 4px", fontSize: 15, letterSpacing: "-.2px", color: "#1f2430" }}>
        마스코트
      </h3>
      <p style={{ margin: "0 0 6px", fontSize: 12.5, color: "#7b8494" }}>
        화면에 캐릭터를 표시합니다. 이 설정은 이 브라우저에만 저장됩니다.
      </p>

      <div style={{ ...rowStyle, borderTop: 0 }}>
        <div>
          마스코트 표시
          <div style={descStyle}>끄면 화면에서 완전히 사라집니다</div>
        </div>
        <Toggle on={cfg.show} onClick={() => update({ show: !cfg.show })} label="마스코트 표시" />
      </div>

      <div style={rowStyle}>
        <div>
          마우스 피하기
          <div style={descStyle}>커서가 가까워지면 비켜섭니다</div>
        </div>
        <Toggle on={cfg.avoid} onClick={() => update({ avoid: !cfg.avoid })} label="마우스 피하기" />
      </div>

      <div style={{ ...rowStyle, display: "block" }}>
        <div style={{ marginBottom: 8 }}>
          표시 방식
          <div style={descStyle}>걸어다님은 화면 아래를 돌아다니고, 구석 고정은 우측 하단에 머뭅니다</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" style={segBtn(cfg.variant === "walk")} onClick={() => update({ variant: "walk" })}>
            걸어다님
          </button>
          <button type="button" style={segBtn(cfg.variant === "corner")} onClick={() => update({ variant: "corner" })}>
            구석 고정
          </button>
        </div>
      </div>

      <div style={{ ...rowStyle, display: "block" }}>
        <div style={{ marginBottom: 8 }}>
          크기
          <div style={descStyle}>{cfg.size}px</div>
        </div>
        <input
          type="range"
          min="48"
          max="140"
          step="4"
          value={cfg.size}
          onChange={(e) => update({ size: Number(e.target.value) })}
          style={{ width: "100%" }}
        />
      </div>

      <div style={{ ...rowStyle, display: "block" }}>
        <div style={{ marginBottom: 8 }}>
          걷는 속도
          <div style={descStyle}>{cfg.speed.toFixed(2)}</div>
        </div>
        <input
          type="range"
          min="0.2"
          max="2"
          step="0.05"
          value={cfg.speed}
          onChange={(e) => update({ speed: Number(e.target.value) })}
          style={{ width: "100%" }}
        />
      </div>

      <div style={rowStyle}>
        <div>
          기본값으로 되돌리기
          <div style={descStyle}>모든 마스코트 설정 초기화</div>
        </div>
        <button
          type="button"
          onClick={() => {
            setCfg({ ...DEFAULTS });
            saveMascotSettings({ ...DEFAULTS });
          }}
          style={{
            fontFamily: "inherit",
            fontSize: 13,
            fontWeight: 700,
            padding: "8px 16px",
            borderRadius: 9,
            border: "1px solid #e6eaf2",
            background: "#f6f8fc",
            color: "#7b8494",
            cursor: "pointer",
          }}
        >
          초기화
        </button>
      </div>
    </div>
  );
}
