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

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function edges(L: Rim) {
  return [
    { start: 0, len: L.hs },
    { start: L.hs + L.arc, len: L.vs },
    { start: L.hs + L.vs + 2 * L.arc, len: L.hs },
    { start: 2 * L.hs + L.vs + 3 * L.arc, len: L.vs },
  ].filter((e) => e.len > 40);
}

function nextPulse(L: Rim, now: number, lastEdge: number): { pulse: Pulse; edge: number } {
  const list = edges(L);
  const picks = list.map((_, i) => i).filter((i) => i !== lastEdge);
  const edge = picks.length ? picks[Math.floor(Math.random() * picks.length)]! : 0;
  const e = list[edge] ?? list[0];
  if (!e) {
    return {
      pulse: {
        from: 0,
        travel: 1,
        dir: 1,
        started: now,
        moveMs: 5000,
        fadeInMs: 800,
        fadeOutMs: 800,
        pauseMs: 1800,
      },
      edge: 0,
    };
  }
  const travel = Math.min(Math.max(90, e.len * 0.28), e.len * 0.45, 180);
  const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
  const room = e.len - travel;
  const offset = room > 8 ? Math.random() * room : 0;
  const from = dir === 1 ? e.start + offset : e.start + offset + travel;
  return {
    edge,
    pulse: {
      from,
      travel,
      dir,
      started: now,
      moveMs: 6400 + Math.random() * 1800,
      fadeInMs: 900,
      fadeOutMs: 1100,
      pauseMs: 1600 + Math.random() * 1400,
    },
  };
}

function ease(u: number) {
  const t = Math.max(0, Math.min(1, u));
  return t * t * (3 - 2 * t);
}

/** Thin gold glow that appears on one edge, glides a short way, then fades and hops. */
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
    const fpsGap = 1000 / 20;

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
      lastEdge = -1;
    };

    const draw = (now: number) => {
      raf = window.requestAnimationFrame(draw);
      if (now - lastDraw < fpsGap) return;
      lastDraw = now;

      const inset = 2;
      const radius = 14;
      const L = rimLayout(w, h, radius, inset);
      if (L.peri < 8) return;

      if (!pulse) {
        const next = nextPulse(L, now, lastEdge);
        pulse = next.pulse;
        lastEdge = next.edge;
      }

      const elapsed = now - pulse.started;
      const visible = pulse.fadeInMs + pulse.moveMs + pulse.fadeOutMs;
      const cycle = visible + pulse.pauseMs;
      if (elapsed >= cycle) {
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
      else if (t > p.fadeInMs + p.moveMs) {
        alpha = 1 - ease((t - p.fadeInMs - p.moveMs) / p.fadeOutMs);
      }
      const moveU = ease(t / visible);
      const dist = p.from + p.dir * p.travel * moveU;
      const tip = pointOnRim(L, dist);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      roundedRect(ctx, 22, 22, Math.max(1, w - 44), Math.max(1, h - 44), Math.max(0, radius - 4));
      ctx.clip("evenodd");
      ctx.globalAlpha = alpha;

      const bloom = 34;
      const glow = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, bloom);
      glow.addColorStop(0, "rgba(255, 250, 235, 0.95)");
      glow.addColorStop(0.12, "rgba(255, 210, 130, 0.55)");
      glow.addColorStop(0.38, "rgba(255, 160, 60, 0.18)");
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(tip.x - bloom, tip.y - bloom, bloom * 2, bloom * 2);
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
