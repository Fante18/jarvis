"use client";
import type { Lead } from "@/lib/domain";
import { money } from "@/lib/domain";
import { useState } from "react";
export function RevenueChart({ leads, days }: { leads: Lead[]; days: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const count = 7;
  const start = Date.now() - days * 86400000;
  const amounts = Array.from({ length: count }, (_, i) =>
    leads
      .filter(
        (l) =>
          l.stage === "won" &&
          Date.parse(l.created_at) >= start + ((i * days) / count) * 86400000 &&
          Date.parse(l.created_at) <
            start + (((i + 1) * days) / count) * 86400000,
      )
      .reduce((sum, l) => sum + l.value, 0),
  );
  const totals = amounts.map((_, i) =>
    amounts.slice(0, i + 1).reduce((a, b) => a + b, 0),
  );
  const max = Math.max(...totals, 10000) * 1.15;
  const points = totals
    .map((v, i) => `${54 + i * 81},${190 - (v / max) * 160}`)
    .join(" ");
  const labels = totals.map((_, i) =>
    new Date(start + (((i + 1) * days) / count) * 86400000).toLocaleDateString(
      "sv-SE",
      { day: "numeric", month: "short" },
    ),
  );
  return (
    <div className="revenue-chart">
      <svg
        viewBox="0 0 570 234"
        role="img"
        aria-label={`Ackumulerat vunnet affärsvärde under ${days} dagar: ${money(totals[6])}. Baserat på när leads skapades.`}
      >
        <defs>
          <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38d9d0" stopOpacity=".23" />
            <stop offset="100%" stopColor="#38d9d0" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line
              x1="54"
              x2="558"
              y1={30 + i * 40}
              y2={30 + i * 40}
              stroke="#1c2533"
              strokeDasharray="3 5"
            />
            <text x="0" y={34 + i * 40} className="chart-label">
              {Math.round((max * (1 - i / 4)) / 1000)}k
            </text>
          </g>
        ))}
        <polygon
          points={`54,190 ${points} 540,190`}
          fill="url(#revenue-fill)"
        />
        <polyline
          points={points}
          fill="none"
          stroke="#48dcd2"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {totals.map((v, i) => (
          <g
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <rect
              x={32 + i * 81}
              y="20"
              width="49"
              height="178"
              fill="transparent"
            />
            <circle
              cx={54 + i * 81}
              cy={190 - (v / max) * 160}
              r={hover === i ? 5 : 2.8}
              fill="#4ee6d6"
              stroke="#101821"
              strokeWidth="2"
            />
            <text
              x={54 + i * 81}
              y="222"
              textAnchor="middle"
              className="chart-label"
            >
              {labels[i]}
            </text>
            {hover === i && (
              <g>
                <rect
                  x={Math.min(54 + i * 81, 450) - 32}
                  y={Math.max(0, 154 - (v / max) * 160)}
                  width="105"
                  height="27"
                  rx="5"
                  fill="#243647"
                />
                <text
                  x={Math.min(54 + i * 81, 450) + 20}
                  y={Math.max(18, 172 - (v / max) * 160)}
                  textAnchor="middle"
                  fill="#e4f8f6"
                  fontSize="11"
                >
                  {money(v, true)}
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
export function Sparkline({ variant = 0 }: { variant?: number }) {
  const paths = [
    "M0 33 L12 29 L22 31 L34 21 L43 24 L53 12 L64 15 L76 4",
    "M0 32 L11 32 L22 20 L33 24 L44 10 L55 17 L65 7 L76 3",
    "M0 28 L12 22 L23 29 L34 20 L45 18 L55 9 L65 14 L76 4",
    "M0 32 L12 32 L22 25 L33 27 L43 20 L55 21 L65 12 L76 6",
  ];
  return (
    <svg className="sparkline" viewBox="0 0 78 40" aria-hidden="true">
      <path
        d={paths[variant]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}
