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

function edges(L: Rim) {
  return [
    { start: 0, len: L.hs },
    { start: L.hs + L.arc, len: L.vs },
    { start: L.hs + L.vs + 2 * L.arc, len: L.hs },
    { start: 2 * L.hs + L.vs + 3 * L.arc, len: L.vs },
  ].filter((e) => e.len > 48);
}

function nextPulse(L: Rim, now: number, lastEdge: number): { pulse: Pulse; edge: number } {
  const list = edges(L);
  const picks = list.map((_, i) => i).filter((i) => i !== lastEdge);
  const edge = picks[Math.floor(Math.random() * picks.length)] ?? 0;
  const e = list[edge] ?? list[0];
  if (!e) {
    return {
      edge: 0,
      pulse: {
        from: 0,
        travel: 80,
        dir: 1,
        started: now,
        moveMs: 14000,
        fadeInMs: 1400,
        fadeOutMs: 1600,
        pauseMs: 2000,
      },
    };
  }
  const travel = Math.min(Math.max(80, e.len * 0.22), 140);
  const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  const room = Math.max(0, e.len - travel);
  const offset = room > 8 ? Math.random() * room : 0;
  const from = dir === 1 ? e.start + offset : e.start + offset + travel;
  return {
    edge,
    pulse: {
      from,
      travel,
      dir,
      started: now,
      moveMs: 12000 + Math.random() * 4000,
      fadeInMs: 1400,
      fadeOutMs: 1800,
      pauseMs: 1800 + Math.random() * 1600,
    },
  };
}

function ease(u: number) {
  const t = Math.max(0, Math.min(1, u));
  return t * t * (3 - 2 * t);
}

function blob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
) {
  if (alpha <= 0.01) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, `rgba(255, 244, 220, ${0.72 * alpha})`);
  g.addColorStop(0.14, `rgba(255, 186, 86, ${0.4 * alpha})`);
  g.addColorStop(0.36, `rgba(255, 132, 36, ${0.16 * alpha})`);
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** Glow-only catch light: no stroke/tail, fades behind, hops to another edge. */
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
    let lastEdge = -1;
    let pulse: Pulse | null = null;
    const fpsGap = 1000 / 30;

    const resize = () => {
      const box = wrap.getBoundingClientRect();
      w = Math.max(1, Math.floor(box.width));
      h = Math.max(1, Math.floor(box.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      pulse = null;
      lastEdge = -1;
    };

    const draw = (now: number) => {
      raf = window.requestAnimationFrame(draw);
      if (now - lastDraw < fpsGap) return;
      lastDraw = now;

      const L = rimLayout(w, h, 16, 2);
      if (L.peri < 16) return;

      if (!pulse) {
        const next = nextPulse(L, now, lastEdge);
        pulse = next.pulse;
        lastEdge = next.edge;
      }

      const visible = pulse.fadeInMs + pulse.moveMs + pulse.fadeOutMs;
      if (now - pulse.started >= visible + pulse.pauseMs) {
        const next = nextPulse(L, now, lastEdge);
        pulse = next.pulse;
        lastEdge = next.edge;
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
      ctx.globalCompositeOperation = "lighter";
      // Soft falloff behind the head — overlapping glows, never a line.
      for (let i = 4; i >= 1; i--) {
        const u = i / 4;
        const pos = pointOnRim(L, dist - p.dir * 11 * i);
        blob(ctx, pos.x, pos.y, 28 + i * 6, alpha * (0.18 * (1 - u * 0.55)));
      }
      blob(ctx, tip.x, tip.y, 46, alpha);
      blob(ctx, tip.x, tip.y, 16, alpha * 0.85);
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
