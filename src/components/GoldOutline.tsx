import { useEffect, useRef } from "react";

type Rim = {
  x: number;
  y: number;
  rw: number;
  rh: number;
  r: number;
  hs: number;
  vs: number;
  arc: number;
  peri: number;
};

type Pulse = {
  from: number;
  travel: number;
  dir: 1 | -1;
  started: number;
  moveMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  pauseMs: number;
};

function rimLayout(w: number, h: number, radius: number, inset: number): Rim {
  const x = inset;
  const y = inset;
  const rw = Math.max(2, w - inset * 2);
  const rh = Math.max(2, h - inset * 2);
  const r = Math.max(0, Math.min(radius, rw / 2, rh / 2));
  const hs = Math.max(0, rw - 2 * r);
  const vs = Math.max(0, rh - 2 * r);
  const arc = (Math.PI / 2) * r;
  return { x, y, rw, rh, r, hs, vs, arc, peri: 2 * hs + 2 * vs + 4 * arc };
}

function pointOnRim(L: Rim, dist: number) {
  let d = ((dist % L.peri) + L.peri) % L.peri;
  const { x, y, rw, rh, r, hs, vs, arc } = L;
  if (d <= hs) return { x: x + r + d, y };
  d -= hs;
  if (d <= arc) {
    const a = -Math.PI / 2 + (r ? d / r : 0);
    return { x: x + rw - r + Math.cos(a) * r, y: y + r + Math.sin(a) * r };
  }
  d -= arc;
  if (d <= vs) return { x: x + rw, y: y + r + d };
  d -= vs;
  if (d <= arc) {
    const a = r ? d / r : 0;
    return { x: x + rw - r + Math.cos(a) * r, y: y + rh - r + Math.sin(a) * r };
  }
  d -= arc;
  if (d <= hs) return { x: x + rw - r - d, y: y + rh };
  d -= hs;
  if (d <= arc) {
    const a = Math.PI / 2 + (r ? d / r : 0);
    return { x: x + r + Math.cos(a) * r, y: y + rh - r + Math.sin(a) * r };
  }
  d -= arc;
  if (d <= vs) return { x, y: y + rh - r - d };
  d -= vs;
  const a = Math.PI + (r ? d / r : 0);
  return { x: x + r + Math.cos(a) * r, y: y + r + Math.sin(a) * r };
}

function cornerAnchors(L: Rim) {
  return [
    L.hs + L.arc * 0.5,
    L.hs + L.vs + L.arc * 1.5,
    L.hs * 2 + L.vs + L.arc * 2.5,
    L.hs * 2 + L.vs * 2 + L.arc * 3.5,
  ];
}

function nextPulse(L: Rim, now: number, lastCorner: number): { pulse: Pulse; corner: number } {
  const anchors = cornerAnchors(L);
  const picks = anchors.map((_, i) => i).filter((i) => i !== lastCorner);
  const corner = picks[Math.floor(Math.random() * picks.length)] ?? 0;
  const from = anchors[corner] ?? 0;
  const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  return {
    corner,
    pulse: {
      from,
      travel: 110 + Math.random() * 50,
      dir,
      started: now,
      moveMs: 7200 + Math.random() * 1600,
      fadeInMs: 1100,
      fadeOutMs: 1400,
      pauseMs: 900 + Math.random() * 900,
    },
  };
}

function ease(u: number) {
  const t = Math.max(0, Math.min(1, u));
  return t * t * (3 - 2 * t);
}

/** Cinematic corner catch-light: thin chrome rim, hot vertex, large outer orange bloom. */
export function GoldOutline() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return;

    let w = 1;
    let h = 1;
    let raf = 0;
    let lastDraw = 0;
    let lastCorner = -1;
    let pulse: Pulse | null = null;
    const fpsGap = 1000 / 24;

    const resize = () => {
      const box = wrap.getBoundingClientRect();
      w = Math.max(1, Math.floor(box.width));
      h = Math.max(1, Math.floor(box.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pulse = null;
      lastCorner = -1;
    };

    const draw = (now: number) => {
      raf = window.requestAnimationFrame(draw);
      if (now - lastDraw < fpsGap) return;
      lastDraw = now;

      const L = rimLayout(w, h, 16, 1.25);
      if (L.peri < 8) return;

      if (!pulse) {
        const next = nextPulse(L, now, lastCorner);
        pulse = next.pulse;
        lastCorner = next.corner;
      }

      const visible = pulse.fadeInMs + pulse.moveMs + pulse.fadeOutMs;
      if (now - pulse.started >= visible + pulse.pauseMs) {
        const next = nextPulse(L, now, lastCorner);
        pulse = next.pulse;
        lastCorner = next.corner;
      }

      ctx.clearRect(0, 0, w, h);
      const p = pulse;
      const t = now - p.started;
      if (t < 0 || t > visible) return;

      let alpha = 1;
      if (t < p.fadeInMs) alpha = ease(t / p.fadeInMs);
      else if (t > p.fadeInMs + p.moveMs) alpha = 1 - ease((t - p.fadeInMs - p.moveMs) / p.fadeOutMs);

      const dist = p.from + p.dir * p.travel * ease(t / visible);
      const tip = pointOnRim(L, dist);

      ctx.save();
      ctx.globalAlpha = alpha;

      const bloom = 120;
      const haze = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, bloom);
      haze.addColorStop(0, "rgba(255, 236, 200, 0.55)");
      haze.addColorStop(0.08, "rgba(255, 176, 72, 0.42)");
      haze.addColorStop(0.22, "rgba(255, 122, 28, 0.22)");
      haze.addColorStop(0.48, "rgba(220, 70, 8, 0.08)");
      haze.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = haze;
      ctx.fillRect(tip.x - bloom, tip.y - bloom, bloom * 2, bloom * 2);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const span = 150;
      const steps = 42;
      let prev = pointOnRim(L, dist - span);
      for (let i = 1; i <= steps; i++) {
        const offset = -span + (i / steps) * span * 2;
        const pos = pointOnRim(L, dist + offset);
        const fade = Math.exp(-Math.abs(offset) / 52);
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = `rgba(255, ${Math.round(214 + fade * 30)}, ${Math.round(150 + fade * 70)}, ${fade * 0.92})`;
        ctx.lineWidth = 0.7 + fade * 1.35;
        ctx.stroke();
        prev = pos;
      }

      const core = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 18);
      core.addColorStop(0, "rgba(255, 252, 240, 1)");
      core.addColorStop(0.35, "rgba(255, 220, 140, 0.7)");
      core.addColorStop(1, "rgba(255, 160, 50, 0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    raf = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} className="gold-outline" aria-hidden>
      <canvas ref={canvasRef} />
    </div>
  );
}
