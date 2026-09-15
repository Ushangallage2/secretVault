import { useEffect, useId, useRef, useState } from "react";

function rimPath(w: number, h: number, inset: number, r: number): string {
  const x = inset;
  const y = inset;
  const width = Math.max(1, w - inset * 2);
  const height = Math.max(1, h - inset * 2);
  const rr = Math.min(r, width / 2, height / 2);
  if (rr <= 0.01) {
    return `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`;
  }
  return [
    `M ${x + rr} ${y}`,
    `H ${x + width - rr}`,
    `A ${rr} ${rr} 0 0 1 ${x + width} ${y + rr}`,
    `V ${y + height - rr}`,
    `A ${rr} ${rr} 0 0 1 ${x + width - rr} ${y + height}`,
    `H ${x + rr}`,
    `A ${rr} ${rr} 0 0 1 ${x} ${y + height - rr}`,
    `V ${y + rr}`,
    `A ${rr} ${rr} 0 0 1 ${x + rr} ${y}`,
    "Z",
  ].join(" ");
}

/** Soft horizon light that rides the outer window rim. */
export function GoldOutline() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => {
      const r = el.getBoundingClientRect();
      setBox({ w: Math.max(1, Math.round(r.width)), h: Math.max(1, Math.round(r.height)) });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { w, h } = box;
  const band = 16;
  const d = w > 0 && h > 0 ? rimPath(w, h, 1, 0) : "";

  return (
    <div ref={wrapRef} className="gold-outline" aria-hidden>
      {d && (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
          <defs>
            <mask id={`gold-rim-${uid}`} maskUnits="userSpaceOnUse">
              <rect x="0" y="0" width={w} height={h} fill="white" />
              <rect
                x={band}
                y={band}
                width={Math.max(1, w - band * 2)}
                height={Math.max(1, h - band * 2)}
                fill="black"
              />
            </mask>
            <filter
              id={`gold-haze-${uid}`}
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur stdDeviation="6" />
            </filter>
            <filter
              id={`gold-soft-${uid}`}
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur stdDeviation="2.4" />
            </filter>
          </defs>
          <g mask={`url(#gold-rim-${uid})`}>
            <path
              className="gold-beam gold-beam-wash"
              d={d}
              pathLength={1000}
              filter={`url(#gold-haze-${uid})`}
            />
            <path
              className="gold-beam gold-beam-glow"
              d={d}
              pathLength={1000}
              filter={`url(#gold-soft-${uid})`}
            />
            <path className="gold-beam gold-beam-core" d={d} pathLength={1000} />
          </g>
        </svg>
      )}
    </div>
  );
}
