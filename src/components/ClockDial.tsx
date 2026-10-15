import { useId } from "react";
import type { Clock } from "../shared/types";
import { CLOCK_KINDS } from "../shared/clocks";

const point = (radius: number, angle: number) => {
  const radians = ((angle - 90) * Math.PI) / 180;
  return [70 + radius * Math.cos(radians), 70 + radius * Math.sin(radians)];
};
function segment(start: number, end: number) {
  const a = point(54, start),
    b = point(54, end),
    c = point(42, end),
    d = point(42, start);
  return `M${a.join(",")} A54,54 0 0 1 ${b.join(",")} L${c.join(",")} A42,42 0 0 0 ${d.join(",")} Z`;
}

export function ClockDial({
  clock,
  className = "",
}: {
  clock: Clock;
  className?: string;
}) {
  const id = "dial" + useId().replace(/:/g, "");
  const kind = clock.kind ?? "goal";
  return (
    <svg
      viewBox="0 0 140 140"
      className={`clock-dial clock-${kind} ${className}`}
      role="img"
      aria-label={`${clock.name}：${clock.value} / ${clock.segments} 格${clock.value === clock.segments ? "，已填满" : ""}`}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--dial-light)" />
          <stop offset="100%" stopColor="var(--dial-accent)" />
        </linearGradient>
        <radialGradient id={id + "-core"}>
          <stop offset="0%" stopColor="#25454b" />
          <stop offset="100%" stopColor="#12282e" />
        </radialGradient>
      </defs>
      <circle
        cx="70"
        cy="70"
        r="64"
        fill="#122b30"
        stroke="#a68c57"
        strokeWidth=".8"
      />
      <circle
        cx="70"
        cy="70"
        r="60"
        fill="none"
        stroke="#d3b775"
        strokeWidth=".5"
        opacity=".45"
      />
      {Array.from({ length: clock.segments * 4 }, (_, i) => {
        const angle = (360 * i) / (clock.segments * 4),
          a = point(i % 4 === 0 ? 57 : 58.5, angle),
          b = point(62, angle);
        return (
          <line
            key={i}
            x1={a[0]}
            y1={a[1]}
            x2={b[0]}
            y2={b[1]}
            stroke="#d9c38b"
            strokeWidth={i % 4 === 0 ? 1.2 : 0.55}
            opacity={i % 4 === 0 ? 0.85 : 0.4}
          />
        );
      })}
      {Array.from({ length: clock.segments }, (_, i) => (
        <path
          key={i}
          d={segment(
            (360 * i) / clock.segments + 2.3,
            (360 * (i + 1)) / clock.segments - 2.3,
          )}
          fill={i < clock.value ? `url(#${id})` : "#29454c"}
          stroke={i < clock.value ? "var(--dial-light)" : "#456069"}
          strokeWidth=".65"
          className={i < clock.value ? "dial-filled" : ""}
        />
      ))}
      <circle
        cx="70"
        cy="70"
        r="36"
        fill={`url(#${id}-core)`}
        stroke="#8d9675"
        strokeWidth=".5"
      />
      <path
        d="M70 30 L73 35 L70 38 L67 35 Z M70 102 L73 105 L70 110 L67 105 Z"
        fill="#bda46c"
      />
      <g
        fill="none"
        stroke="#c1ac73"
        strokeWidth=".5"
        opacity=".15"
        aria-hidden="true"
      >
        {Array.from({ length: 8 }, (_, i) => (
          <ellipse
            key={i}
            cx="70"
            cy="57"
            rx="9"
            ry="22"
            transform={`rotate(${45 * i} 70 70)`}
          />
        ))}
      </g>
      <text x="70" y="55" className="dial-symbol" textAnchor="middle">
        {CLOCK_KINDS[kind].glyph}
      </text>
      <text x="70" y="82" className="dial-number" textAnchor="middle">
        {clock.value}
      </text>
      <text x="70" y="96" className="dial-total" textAnchor="middle">
        / {clock.segments}
      </text>
      {[0, 90, 180, 270].map((angle) => (
        <path
          key={angle}
          d="M70 1 L74 7 L70 13 L66 7 Z"
          transform={`rotate(${angle} 70 70)`}
          fill="#dac288"
          stroke="#826b42"
          strokeWidth=".6"
        />
      ))}
    </svg>
  );
}
