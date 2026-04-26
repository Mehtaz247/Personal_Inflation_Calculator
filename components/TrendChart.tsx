"use client";

import { Info } from "lucide-react";

interface Point { month: string; personal: number | null; official: number }

export default function TrendChart({ data }: { data: Point[] }) {
  if (data.length < 2) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm text-zinc-400">
        Not enough monthly history yet to draw a trend (need ≥2 months of YoY).
      </div>
    );
  }

  const W = 640;
  const H = 220;
  const PAD_L = 44;
  const PAD_R = 14;
  const PAD_T = 14;
  const PAD_B = 32;

  const ys: number[] = [];
  for (const d of data) {
    ys.push(d.official);
    if (d.personal != null) ys.push(d.personal);
  }
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const span = Math.max(0.005, ymax - ymin);
  const yLo = ymin - span * 0.15;
  const yHi = ymax + span * 0.15;

  const xScale = (i: number) => PAD_L + (i / Math.max(1, data.length - 1)) * (W - PAD_L - PAD_R);
  const yScale = (v: number) => PAD_T + (1 - (v - yLo) / (yHi - yLo)) * (H - PAD_T - PAD_B);

  // Personal line: skip null points (gap), restart M after each gap.
  const personalPath = (() => {
    let d = "";
    let pen = "M";
    data.forEach((p, i) => {
      if (p.personal == null) {
        pen = "M";
        return;
      }
      d += `${pen} ${xScale(i).toFixed(1)} ${yScale(p.personal).toFixed(1)} `;
      pen = "L";
    });
    return d.trim();
  })();

  const officialPath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(d.official).toFixed(1)}`)
    .join(" ");

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => yLo + ((yHi - yLo) * i) / ticks);

  const xLabelEvery = Math.max(1, Math.floor(data.length / 6));
  const personalPoints = data.filter((d) => d.personal != null);
  const personalNote = personalPoints.length < data.length;

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 shadow-sm backdrop-blur-md">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">Personal vs official inflation</h3>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 bg-emerald-400" /> Personal
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="16" height="2"><line x1="0" y1="1" x2="16" y2="1" stroke="#52525b" strokeDasharray="3 2" strokeWidth="1.5" /></svg>
            Official
          </span>
        </div>
      </div>
      <p className="mb-3 text-[11px] text-zinc-500">
        Last {data.length} months · YoY %
      </p>
      {personalNote && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
          <div>
            <span className="font-medium text-amber-100">
              Personal inflation only plotted from {shortMonth(personalPoints[0]?.month ?? "")}
              {personalPoints.length > 0 &&
                ` (${personalPoints.length} of ${data.length} months)`}
              .
            </span>{" "}
            MoSPI&apos;s base-2024 CPI series only publishes division-level (COICOP) indices
            from Jan 2025 onward, and YoY needs the same month a year earlier — so earlier
            months can&apos;t be computed and are left out of the green line. The dashed
            official line uses the general index, which has a longer history.
          </div>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={yScale(t)}
              y2={yScale(t)}
              stroke="#27272a"
              strokeWidth="1"
            />
            <text x={PAD_L - 6} y={yScale(t)} textAnchor="end" dominantBaseline="middle" className="fill-zinc-500 text-[10px]">
              {(t * 100).toFixed(1)}%
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % xLabelEvery === 0 || i === data.length - 1 ? (
            <text key={d.month} x={xScale(i)} y={H - 12} textAnchor="middle" className="fill-zinc-500 text-[10px]">
              {shortMonth(d.month)}
            </text>
          ) : null,
        )}
        <path d={officialPath} fill="none" stroke="#52525b" strokeWidth="1.5" strokeDasharray="4 3" />
        {personalPath && <path d={personalPath} fill="none" stroke="#34d399" strokeWidth="2" />}
      </svg>
    </div>
  );
}

function shortMonth(m: string): string {
  if (!m) return "";
  const [y, mm] = m.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[Number(mm) - 1]} ${y.slice(2)}`;
}
