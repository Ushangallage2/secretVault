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

/** Premium border beam: thin rim light, hot tip, fading tail, outward bloom. */
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
    let last = 0;
    const started = performance.now();
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
    };

    const draw = (now: number) => {
      raf = window.requestAnimationFrame(draw);
      if (now - last < fpsGap) return;
      last = now;

      const inset = 2;
      const radius = 14;
      const L = rimLayout(w, h, radius, inset);
      if (L.peri < 8) return;

      const t = ((now - started) % 96_000) / 96_000;
      const head = t * L.peri;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      roundedRect(ctx, 36, 36, Math.max(1, w - 72), Math.max(1, h - 72), Math.max(0, radius - 4));
      ctx.clip("evenodd");

      const tip = pointOnRim(L, head);
      const bloom = 88;
      const glow = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, bloom);
      glow.addColorStop(0, "rgba(255, 250, 235, 0.95)");
      glow.addColorStop(0.08, "rgba(255, 205, 120, 0.7)");
      glow.addColorStop(0.22, "rgba(255, 148, 48, 0.32)");
      glow.addColorStop(0.48, "rgba(220, 84, 16, 0.1)");
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
