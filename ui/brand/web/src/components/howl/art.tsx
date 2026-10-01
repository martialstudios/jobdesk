// JobDesk branded builds, "howl" theme (BRAND_THEME=howl): original drawings
// in the spirit of a Ghibli afternoon. A patchwork castle that walks on bird
// legs, a friendly hearth flame, clouds, stars and a flower meadow. All drawn
// here as SVG: no film stills or studio artwork ship in the app.

import type { CSSProperties } from "react";

export const HOWL_CSS = `
@keyframes howl-step { from { transform: rotate(-16deg) } to { transform: rotate(16deg) } }
@keyframes howl-bob { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-2.5px) } }
@keyframes howl-puff { 0% { transform: translate(0, 0) scale(.6); opacity: .75 } 100% { transform: translate(-10px, -30px) scale(1.9); opacity: 0 } }
@keyframes howl-flicker { 0%, 100% { transform: scale(1, 1) } 35% { transform: scale(.96, 1.06) } 70% { transform: scale(1.03, .97) } }
@keyframes howl-blink { 0%, 92%, 100% { transform: scaleY(1) } 95% { transform: scaleY(.1) } }
@keyframes howl-drift { from { transform: translateX(-30vw) } to { transform: translateX(130vw) } }
@keyframes howl-twinkle { 0%, 100% { opacity: .25 } 50% { opacity: 1 } }
@keyframes howl-shoot { 0%, 88% { transform: translate(0, 0); opacity: 0 } 90% { opacity: 1 } 100% { transform: translate(-260px, 120px); opacity: 0 } }
.howl-leg { transform-box: view-box; animation: howl-step .9s ease-in-out infinite alternate }
.howl-leg-b { animation-delay: -.9s }
.howl-body { animation: howl-bob .45s ease-in-out infinite }
.howl-puff { transform-box: fill-box; transform-origin: center; animation: howl-puff 2.4s ease-out infinite }
.howl-flame { transform-box: fill-box; transform-origin: 50% 100%; animation: howl-flicker 1.6s ease-in-out infinite }
.howl-eye { transform-box: fill-box; transform-origin: center; animation: howl-blink 4.5s ease-in-out infinite }
.howl-still .howl-leg, .howl-still .howl-body { animation: none }
.howl-night { display: none }
.dark .howl-day { display: none }
.dark .howl-night { display: block }
@media (prefers-reduced-motion: reduce) {
  .howl-leg, .howl-body, .howl-puff, .howl-flame, .howl-eye, .howl-cloud, .howl-star, .howl-shooting { animation: none !important }
}
`;

/** The castle. `walking` moves the legs and puffs the chimneys. */
export function Castle({ width = 120, walking = true, style }: { width?: number; walking?: boolean; style?: CSSProperties }) {
  return (
    <svg viewBox="0 -14 140 146" width={width} height={(width * 146) / 140} style={style} className={walking ? undefined : "howl-still"} aria-hidden>
      {/* Legs, behind the body: hip, knee, ankle, three toes. */}
      {[
        { x: 50, cls: "howl-leg" },
        { x: 90, cls: "howl-leg howl-leg-b" },
      ].map(({ x, cls }) => (
        <g key={x} className={cls} style={{ transformOrigin: `${x}px 92px` }}>
          {/* Bird legs: the knee bends back, three toes forward and one behind. */}
          <path d={`M${x} 92 L${x + 6} 107 L${x - 1} 121`} fill="none" stroke="#6b5a4a" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M${x - 1} 121 l-9 4 M${x - 1} 121 l-3 7 M${x - 1} 121 l5 6 M${x - 1} 121 l6 -2`} stroke="#6b5a4a" strokeWidth="3" strokeLinecap="round" />
        </g>
      ))}
      <g className="howl-body">
        {/* Smoke from the chimneys. */}
        {walking &&
          [0, 0.8, 1.6].map((d, i) => (
            <g key={i}>
              <circle className="howl-puff" cx="49" cy="14" r="4" fill="#e9eef3" style={{ animationDelay: `${d}s` }} />
              <circle className="howl-puff" cx="103" cy="30" r="3.4" fill="#e9eef3" style={{ animationDelay: `${d + 0.4}s` }} />
            </g>
          ))}
        <rect x="46" y="16" width="6" height="16" rx="1" fill="#5a5550" />
        <rect x="100" y="32" width="6" height="14" rx="1" fill="#5a5550" />
        {/* Left tower and roof. */}
        <rect x="28" y="22" width="17" height="30" fill="#8e9aae" stroke="#4a5468" strokeWidth="1.5" />
        <path d="M25 24 L36.5 2 L48 24 Z" fill="#5e6b85" stroke="#4a5468" strokeWidth="1.5" strokeLinejoin="round" />
        {/* Tall middle tower, dome and pennant. */}
        <rect x="56" y="8" width="19" height="36" fill="#9aa6b8" stroke="#4a5468" strokeWidth="1.5" />
        <path d="M53 10 Q65.5 -9 78 10 Z" fill="#4f6f72" stroke="#3c5558" strokeWidth="1.5" />
        <path d="M65.5 -3 V-13 L74 -10 L65.5 -7" fill="#c8664f" stroke="#5b5048" strokeWidth="1" />
        <path d="M61 30 v-7 a4.5 4.5 0 0 1 9 0 v7 Z" fill="#f4d27a" />
        {/* Right turret. */}
        <rect x="84" y="26" width="15" height="22" fill="#a7b1c1" stroke="#4a5468" strokeWidth="1.5" />
        <path d="M81 28 L91.5 13 L102 28 Z" fill="#a0614a" stroke="#5b5048" strokeWidth="1.5" strokeLinejoin="round" />
        {/* A little round turret leaning out on the left, a pipe on the right. */}
        <path d="M118 62 L133 56" stroke="#5a5550" strokeWidth="5" strokeLinecap="round" />
        <rect x="5" y="52" width="15" height="16" fill="#a7b1c1" stroke="#4a5468" strokeWidth="1.5" />
        <path d="M3 54 L12.5 42 L22 54 Z" fill="#4f6f72" stroke="#3c5558" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="12.5" cy="60" r="2.6" fill="#f4d27a" stroke="#5b5048" strokeWidth="1" />
        {/* The lumpy hull, shaded underneath. */}
        <path
          d="M18 72 Q14 52 30 46 L38 40 Q62 31 88 37 L104 42 Q122 48 119 68 Q121 88 98 94 L42 96 Q20 94 18 72 Z"
          fill="#7d8ba0" stroke="#4a5468" strokeWidth="2" strokeLinejoin="round"
        />
        <path d="M21 80 Q62 88 118 78 Q116 90 98 94 L42 96 Q24 94 21 80 Z" fill="#6a7890" />
        <path d="M40 41 Q63 33 87 38" fill="none" stroke="#9aa6b8" strokeWidth="2" strokeLinecap="round" />
        {/* Patches: planks and copper. */}
        <path d="M29 74 L56 71 L58 91 L33 91 Z" fill="#9c7a5b" stroke="#5b5048" strokeWidth="1.5" />
        <path d="M30 80 L57 77.5 M31.5 86 L57.5 84" stroke="#7d5f45" strokeWidth="1" />
        <path d="M88 50 Q105 50 109 60 L107 79 L88 81 Z" fill="#b9845a" stroke="#5b5048" strokeWidth="1.5" />
        <circle cx="93" cy="55" r="1" fill="#5b5048" />
        <circle cx="103" cy="58" r="1" fill="#5b5048" />
        <circle cx="92" cy="76" r="1" fill="#5b5048" />
        {/* Warm windows. */}
        {[
          [40, 58, 3.6],
          [67, 50, 4.2],
          [77, 64, 3],
          [97, 67, 3.2],
          [36.5, 36, 3],
        ].map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#f4d27a" stroke="#5b5048" strokeWidth="1" />
        ))}
        <path d="M60 94 v-10 a6 6 0 0 1 12 0 v10" fill="#5b5048" />
      </g>
    </svg>
  );
}

/** A friendly little hearth flame. */
export function Flame({ size = 28, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 40 48" width={size} height={(size * 48) / 40} style={style} aria-hidden>
      <g className="howl-flame">
        <path d="M20 2 C26 12 36 18 34 32 C33 42 26 46 20 46 C14 46 7 42 6 32 C5 22 14 16 20 2 Z" fill="#f08a3c" />
        <path d="M20 14 C24 22 29 26 28 34 C27 40 24 42 20 42 C16 42 13 40 12 34 C11 28 16 22 20 14 Z" fill="#f9c74f" />
        <g className="howl-eye">
          <ellipse cx="15" cy="31" rx="3.7" ry="4.3" fill="#fff" />
          <ellipse cx="25" cy="31" rx="3.7" ry="4.3" fill="#fff" />
          <circle cx="15.6" cy="32" r="1.9" fill="#3a2a22" />
          <circle cx="24.4" cy="32" r="1.9" fill="#3a2a22" />
        </g>
      </g>
    </svg>
  );
}

export function Cloud({ width = 160, style, className }: { width?: number; style?: CSSProperties; className?: string }) {
  return (
    <svg viewBox="0 0 104 46" width={width} height={(width * 46) / 104} style={style} className={className} aria-hidden>
      <path d="M8 42 Q4 28 18 25 Q21 10 38 13 Q48 1 63 10 Q80 6 83 22 Q99 23 97 42 Z" fill="#ffffff" />
      <path d="M10 42 Q30 35 52 39 Q76 34 96 42 Z" fill="#dbe8f4" />
    </svg>
  );
}

/** Rolling hills with flowers, the castle far off on the right. */
export function Meadow({ style }: { style?: CSSProperties }) {
  const flowers: [number, number, string][] = [
    [14, 52, "#ffffff"], [26, 58, "#f4d27a"], [38, 50, "#9db4e0"], [52, 60, "#e9a8b5"], [64, 54, "#ffffff"],
    [78, 61, "#f4d27a"], [90, 55, "#e9a8b5"], [104, 62, "#9db4e0"], [118, 57, "#ffffff"], [132, 63, "#f4d27a"],
    [146, 58, "#e9a8b5"], [160, 64, "#ffffff"], [174, 59, "#9db4e0"], [188, 65, "#f4d27a"], [22, 66, "#e9a8b5"],
    [46, 68, "#ffffff"], [70, 69, "#9db4e0"], [96, 70, "#ffffff"], [124, 71, "#e9a8b5"], [152, 72, "#f4d27a"],
  ];
  return (
    <svg viewBox="0 0 200 80" width="100%" style={style} aria-hidden>
      <g className="howl-day">
        <path d="M0 50 Q50 30 110 42 Q160 52 200 38 V80 H0 Z" fill="#b9d3ad" />
        <path d="M0 60 Q60 46 120 58 Q170 66 200 54 V80 H0 Z" fill="#97bf8f" />
      </g>
      <g className="howl-night">
        <path d="M0 50 Q50 30 110 42 Q160 52 200 38 V80 H0 Z" fill="#2f4a3a" />
        <path d="M0 60 Q60 46 120 58 Q170 66 200 54 V80 H0 Z" fill="#243b2e" />
      </g>
      {flowers.map(([x, y, c]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill={c} opacity=".9" />
      ))}
      <g transform="translate(144 2)">
        <Castle width={44} />
      </g>
    </svg>
  );
}
