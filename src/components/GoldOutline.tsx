import { useEffect, useRef } from "react";

type Rim = {
  x: number;
  y: number;
  rw: number;
  rh: number;
  r: number;
  peri: number;
};

function rimLayout(w: number, h: number, radius: number, inset: number): Rim {
  const x = inset;
  const y = inset;
  const rw = Math.max(2, w - inset * 2);
  const rh = Math.max(2, h - inset * 2);
  const r = Math.max(0, Math.min(radius, rw / 2, rh / 2));
  const hs = Math.max(0, rw - 2 * r);
  const vs = Math.max(0, rh - 2 * r);
  const peri = 2 * hs + 2 * vs + 2 * Math.PI * r;
  return { x, y, rw, rh, r, peri };
}

function pointOnRim(L: Rim, dist: number) {
  const hs = Math.max(0, L.rw - 2 * L.r);
  const vs = Math.max(0, L.rh - 2 * L.r);
  const arc = (Math.PI / 2) * L.r;
  let d = ((dist % L.peri) + L.peri) % L.peri;
  const { x, y, rw, rh, r } = L;
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

function roundRectPath(x: number, y: number, w: number, h: number, r: number) {
  const p = new Path2D();
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  p.moveTo(x + rr, y);
  p.arcTo(x + w, y, x + w, y + h, rr);
  p.arcTo(x + w, y + h, x, y + h, rr);
  p.arcTo(x, y + h, x, y, rr);
  p.arcTo(x, y, x + w, y, rr);
  p.closePath();
  return p;
}

/** Smooth neon border beam: one native rounded-rect stroke + corner bloom. */
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
    const started = performance.now();
    const loopMs = 28_000;

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
    };

    const draw = (now: number) => {
      raf = window.requestAnimationFrame(draw);
      const radius = 18;
      const inset = 1.5;
      const L = rimLayout(w, h, radius, inset);
      if (L.peri < 16) return;

      const t = ((now - started) % loopMs) / loopMs;
      const head = t * L.peri;
      const beam = Math.min(220, L.peri * 0.14);
      const path = roundRectPath(L.x, L.y, L.rw, L.rh, L.r);
      const tip = pointOnRim(L, head);

      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash([beam, Math.max(1, L.peri - beam)]);
      ctx.lineDashOffset = -(head - beam);

      ctx.strokeStyle = "rgba(255, 120, 24, 0.22)";
      ctx.lineWidth = 14;
      ctx.stroke(path);

      ctx.strokeStyle = "rgba(255, 176, 72, 0.45)";
      ctx.lineWidth = 5;
      ctx.stroke(path);

      ctx.strokeStyle = "rgba(255, 236, 196, 0.95)";
      ctx.lineWidth = 1.6;
      ctx.stroke(path);

      ctx.setLineDash([]);
      const bloom = 90;
      const haze = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, bloom);
      haze.addColorStop(0, "rgba(255, 244, 220, 0.7)");
      haze.addColorStop(0.1, "rgba(255, 176, 70, 0.4)");
      haze.addColorStop(0.28, "rgba(255, 118, 28, 0.16)");
      haze.addColorStop(0.55, "rgba(200, 60, 8, 0.05)");
      haze.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = haze;
      ctx.fillRect(tip.x - bloom, tip.y - bloom, bloom * 2, bloom * 2);
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
