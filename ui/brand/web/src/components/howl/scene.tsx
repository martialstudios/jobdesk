"use client";

// JobDesk branded builds, "howl" theme: the picture under "Searching job
// boards…" while a search runs. Original drawings, a Ghibli-afternoon
// landscape: far mountains and a lake, a cottage with washing on the line, a
// hopping scarecrow, birds and a little airship, and the walking castle going
// down the path as the search gets further. At night: a moon, stars, a falling
// star and fireflies. Below it, a rotating line about what's going on.

import { useEffect, useState } from "react";
import { Castle } from "./art";

const SCENE_CSS = `
@keyframes howl-hop { 0%, 55%, 100% { transform: translateY(0) } 25% { transform: translateY(-9px) } }
@keyframes howl-flap { 0%, 100% { transform: scaleY(1) } 50% { transform: scaleY(-.6) } }
@keyframes howl-fly { from { transform: translateX(-80px) } to { transform: translateX(700px) } }
@keyframes howl-float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-5px) } }
@keyframes howl-sway { 0%, 100% { transform: rotate(-4deg) } 50% { transform: rotate(4deg) } }
@keyframes howl-glow { 0%, 100% { opacity: .15 } 50% { opacity: 1 } }
@keyframes howl-sparkle { 0%, 100% { opacity: 0 } 50% { opacity: .9 } }
@keyframes howl-flutter { 0%, 100% { transform: skewX(0) } 50% { transform: skewX(-8deg) } }
.howl-hop { animation: howl-hop 1.4s ease-in-out infinite }
.howl-flap { transform-box: fill-box; transform-origin: center; animation: howl-flap .5s ease-in-out infinite }
.howl-fly { animation: howl-fly 26s linear infinite }
.howl-float { animation: howl-float 4s ease-in-out infinite }
.howl-sway { transform-box: fill-box; transform-origin: 50% 100%; animation: howl-sway 3s ease-in-out infinite }
.howl-glow { animation: howl-glow 2.6s ease-in-out infinite }
.howl-sparkle { animation: howl-sparkle 2.2s ease-in-out infinite }
.howl-flutter { transform-box: fill-box; transform-origin: 50% 0; animation: howl-flutter 1.8s ease-in-out infinite }
@media (prefers-reduced-motion: reduce) {
  .howl-hop, .howl-flap, .howl-fly, .howl-float, .howl-sway, .howl-glow, .howl-sparkle, .howl-flutter { animation: none !important }
}
`;

const LINES = [
  "The castle is stomping over to the next job board…",
  "Asking the scarecrow which way the jobs went…",
  "Checking every window in town for “Now hiring” signs…",
  "Following a falling star to a fresh posting…",
  "The hearth fire is reading job descriptions out loud…",
  "Packing your resume into the castle’s best suitcase…",
  "Waving at the airship in case it’s hiring…",
];

const STARS: [number, number][] = [
  [40, 18], [92, 40], [140, 12], [188, 30], [236, 8], [290, 26], [338, 14], [396, 34], [450, 10], [512, 28], [560, 16], [70, 52], [258, 48], [470, 50],
];
const FLIES: [number, number][] = [[120, 128], [210, 140], [330, 122], [420, 136], [520, 126], [60, 142]];
const FLOWERS: [number, number, string][] = [
  [30, 150, "#ffffff"], [58, 158, "#f4d27a"], [96, 152, "#e9a8b5"], [150, 160, "#9db4e0"], [205, 154, "#ffffff"],
  [262, 161, "#f4d27a"], [318, 156, "#e9a8b5"], [372, 162, "#ffffff"], [430, 155, "#9db4e0"], [488, 160, "#f4d27a"],
  [540, 153, "#e9a8b5"], [578, 161, "#ffffff"],
];

/** `progress` 0–1 moves the castle down the path. */
export function HowlSearchScene({ progress, found }: { progress: number; found: number }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setLine((l) => (l + 1) % LINES.length), 4200);
    return () => window.clearInterval(t);
  }, []);
  const x = 40 + Math.max(0, Math.min(1, progress)) * 460;

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <style>{SCENE_CSS}</style>
      <svg viewBox="0 0 600 175" width="100%" role="img" aria-label="A walking castle crossing a meadow while the search runs" style={{ display: "block" }}>
        {/* Sky, sun or moon, stars. */}
        <g className="howl-day">
          <rect width="600" height="175" fill="#cfe5f3" />
          <rect y="70" width="600" height="105" fill="#e4f0f6" />
          <circle cx="520" cy="34" r="16" fill="#fbe7a8" />
        </g>
        <g className="howl-night">
          <rect width="600" height="175" fill="#1d2645" />
          <rect y="70" width="600" height="105" fill="#26304f" />
          <path d="M524 20 a16 16 0 1 0 12 28 a13 13 0 1 1 -12 -28 Z" fill="#f3ecd2" />
          {STARS.map(([sx, sy], i) => (
            <circle key={i} className="howl-sparkle" cx={sx} cy={sy} r="1.2" fill="#fff" style={{ animationDelay: `${-i * 0.37}s` }} />
          ))}
          <g className="howl-shooting" style={{ animation: "howl-shoot 9s ease-out infinite" }}>
            <path d="M470 12 l-46 18" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".9" />
          </g>
        </g>

        {/* A floating rock island with a tree, drifting a little. */}
        <g className="howl-float">
          <path d="M70 42 Q92 34 116 42 Q110 56 96 62 Q86 58 78 52 Z" fill="#8a9a8c" />
          <path d="M70 42 Q92 34 116 42 Q100 46 70 42 Z" fill="#7fae7a" />
          <circle cx="98" cy="30" r="9" fill="#6f9e6b" />
          <rect x="96.5" y="34" width="3" height="8" fill="#6b5a4a" />
        </g>

        {/* The little airship, crossing slowly. */}
        <g className="howl-fly" style={{ animationDuration: "40s", animationDelay: "-12s" }}>
          <g transform="translate(0 46)">
            <ellipse cx="0" cy="0" rx="22" ry="8" fill="#c9b79c" stroke="#6b5a4a" strokeWidth="1.2" />
            <path d="M-22 0 l-8 -6 v12 Z" fill="#a0614a" />
            <rect x="-7" y="7" width="14" height="5" rx="1.5" fill="#6b5a4a" />
          </g>
        </g>

        {/* Birds. */}
        <g className="howl-fly">
          {[0, 1, 2].map((i) => (
            <path key={i} className="howl-flap" d={`M${i * 16} ${30 + (i % 2) * 8} q5 -5 10 0 q5 -5 10 0`} fill="none" stroke="#4a5468" strokeWidth="1.6" strokeLinecap="round" style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </g>

        {/* Far mountains and the lake. */}
        <g className="howl-day">
          <path d="M0 100 L60 70 L110 92 L170 58 L240 96 L300 72 L360 98 L430 64 L500 94 L560 74 L600 90 V112 H0 Z" fill="#9fb3c8" opacity=".75" />
          <path d="M0 106 Q150 98 300 104 Q450 110 600 102 V120 H0 Z" fill="#a9cfe0" />
        </g>
        <g className="howl-night">
          <path d="M0 100 L60 70 L110 92 L170 58 L240 96 L300 72 L360 98 L430 64 L500 94 L560 74 L600 90 V112 H0 Z" fill="#33405f" />
          <path d="M0 106 Q150 98 300 104 Q450 110 600 102 V120 H0 Z" fill="#3b5577" />
        </g>
        {[[180, 110], [260, 113], [390, 109], [470, 112]].map(([lx, ly], i) => (
          <path key={i} className="howl-sparkle" d={`M${lx} ${ly} h10`} stroke="#fff" strokeWidth="1.4" strokeLinecap="round" style={{ animationDelay: `${i * 0.5}s` }} />
        ))}

        {/* Meadow, path and flowers. */}
        <g className="howl-day">
          <path d="M0 122 Q120 108 260 120 Q420 132 600 116 V175 H0 Z" fill="#a7cb98" />
          <path d="M0 142 Q160 130 320 144 Q470 156 600 140 V175 H0 Z" fill="#8dbd84" />
        </g>
        <g className="howl-night">
          <path d="M0 122 Q120 108 260 120 Q420 132 600 116 V175 H0 Z" fill="#30503c" />
          <path d="M0 142 Q160 130 320 144 Q470 156 600 140 V175 H0 Z" fill="#284433" />
        </g>
        <path d="M0 150 Q150 140 300 147 Q450 154 600 144" fill="none" stroke="#d9c7a1" strokeWidth="7" strokeLinecap="round" opacity=".85" />
        {FLOWERS.map(([fx, fy, c], i) => (
          <g key={i} className="howl-sway" style={{ animationDelay: `${-i * 0.4}s` }}>
            <path d={`M${fx} ${fy + 6} V${fy}`} stroke="#5f8f5a" strokeWidth="1.2" />
            <circle cx={fx} cy={fy} r="2.2" fill={c} />
          </g>
        ))}

        {/* The cottage with smoke and washing. */}
        <g transform="translate(470 92)">
          <rect x="0" y="16" width="34" height="24" fill="#efe3c8" stroke="#6b5a4a" strokeWidth="1.2" />
          <path d="M-4 18 L17 2 L38 18 Z" fill="#b5523f" stroke="#6b5a4a" strokeWidth="1.2" strokeLinejoin="round" />
          <rect x="25" y="2" width="5" height="10" fill="#6b5a4a" />
          <circle className="howl-puff" cx="27.5" cy="0" r="3" fill="#eef2f5" />
          <circle className="howl-puff" cx="27.5" cy="0" r="3" fill="#eef2f5" style={{ animationDelay: "1.2s" }} />
          <rect x="6" y="24" width="7" height="7" fill="#f4d27a" stroke="#6b5a4a" strokeWidth="1" />
          <rect x="20" y="26" width="8" height="14" fill="#8a6a4f" />
          <path d="M38 22 L66 26" stroke="#6b5a4a" strokeWidth=".8" />
          <rect className="howl-flutter" x="44" y="23" width="7" height="9" fill="#9db4e0" />
          <rect className="howl-flutter" x="55" y="24.5" width="7" height="8" fill="#e9a8b5" style={{ animationDelay: ".4s" }} />
          <path d="M66 26 V40" stroke="#6b5a4a" strokeWidth="1.2" />
        </g>

        {/* The scarecrow, hopping along. */}
        <g transform="translate(90 112)">
          <g className="howl-hop">
            <path d="M10 14 V40" stroke="#6b5a4a" strokeWidth="2.2" />
            <path d="M-2 20 H22" stroke="#6b5a4a" strokeWidth="2" strokeLinecap="round" />
            <path d="M2 18 H18 L16 32 H4 Z" fill="#a0614a" stroke="#5b5048" strokeWidth="1" />
            <rect x="7" y="22" width="5" height="4" fill="#c9b79c" />
            <circle cx="10" cy="11" r="5" fill="#efe3c8" stroke="#5b5048" strokeWidth="1" />
            <path d="M3 8 h14 l-2.5 -5 h-9 Z" fill="#4f6f72" />
          </g>
        </g>

        {/* Fireflies at night. */}
        <g className="howl-night">
          {FLIES.map(([fx, fy], i) => (
            <circle key={i} className="howl-glow" cx={fx} cy={fy} r="2" fill="#f6e58d" style={{ animationDelay: `${-i * 0.6}s` }} />
          ))}
        </g>

        {/* The castle, further down the path as the search goes on. */}
        <g style={{ transform: `translate(${x - 30}px, 86px)`, transition: "transform .8s ease-out" }}>
          <Castle width={60} />
        </g>
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-sm">
        <span key={line} className="text-foreground" style={{ animation: "co-rise .4s ease both" }}>
          {LINES[line]}
        </span>
        <span className="font-mono text-muted">
          {found > 0 ? `${found} job${found === 1 ? "" : "s"} found so far` : "looking…"}
        </span>
      </div>
    </div>
  );
}
