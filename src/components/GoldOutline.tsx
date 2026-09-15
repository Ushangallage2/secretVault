import { useEffect, useRef } from "react";

function pointOnRect(dist: number, w: number, h: number, inset: number) {
  const rw = Math.max(1, w - inset * 2);
  const rh = Math.max(1, h - inset * 2);
  const peri = 2 * (rw + rh);
  let p = dist % peri;
  if (p < 0) p += peri;
  const x0 = inset;
  const y0 = inset;
  if (p < rw) return { x: x0 + p, y: y0 };
  p -= rw;
  if (p < rh) return { x: x0 + rw, y: y0 + p };
  p -= rh;
  if (p < rw) return { x: x0 + rw - p, y: y0 + rh };
  p -= rw;
  return { x: x0, y: y0 + rh - p };
}

/** Bright tip with a fading tail, drawn on canvas so the UI stays smooth. */
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
    const start = performance.now();
    const fpsGap = 1000 / 24;

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      w = Math.max(1, Math.floor(r.width));
      h = Math.max(1, Math.floor(r.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
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
      const peri = 2 * (Math.max(1, w - 3) + Math.max(1, h - 3));
      const t = ((now - start) % 52_000) / 52_000;
      const head = t * peri;
      const tail = peri * 0.08;
      ctx.clearRect(0, 0, w, h);
      const steps = 22;
      for (let i = steps; i >= 0; i--) {
        const u = i / steps;
        const pos = pointOnRect(head - u * tail, w, h, 1.5);
        const fade = (1 - u) ** 2.1;
        const radius = 0.7 + fade * 2.2;
        ctx.beginPath();
        ctx.fillStyle = `rgba(255, ${Math.round(198 + fade * 42)}, ${Math.round(110 + fade * 90)}, ${0.04 + fade * 0.7})`;
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      const tip = pointOnRect(head, w, h, 1.5);
      ctx.beginPath();
      ctx.fillStyle = "rgba(255, 250, 232, 0.95)";
      ctx.arc(tip.x, tip.y, 2.15, 0, Math.PI * 2);
      ctx.fill();
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
