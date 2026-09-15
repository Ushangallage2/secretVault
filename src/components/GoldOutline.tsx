import { useEffect, useState } from "react";

/** A gold beam traces the window edge about once a minute. */
export function GoldOutline() {
  const [run, setRun] = useState(true);

  useEffect(() => {
    const pulse = () => {
      setRun(false);
      window.requestAnimationFrame(() => setRun(true));
    };
    pulse();
    const id = window.setInterval(pulse, 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className={run ? "gold-outline run" : "gold-outline"} aria-hidden>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="gold-beam-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f6e7b2" />
            <stop offset="45%" stopColor="#e0c06a" />
            <stop offset="100%" stopColor="#c4922e" />
          </linearGradient>
        </defs>
        <rect
          x="0.6"
          y="0.6"
          width="98.8"
          height="98.8"
          rx="0.4"
          pathLength="1000"
        />
      </svg>
    </div>
  );
}
