"use client";

import { useId, useState } from "react";
import { useAuthedImage } from "@/lib/use-authed-image";

/* ---------------------------------- types ---------------------------------- */

export type P = {
  id: string;
  userUUID: string | null;
  username: string | null;
  imagePath?: string;
  caption?: string;
  timestamp: Date | null;
  likedBy: string[];
  imageWidth?: number;
  imageHeight?: number;
  deleted?: boolean;
  deletedAt?: Date | null;
  keys: string[];
};

export type C = {
  id: string;
  postId: string;
  userUUID: string | null;
  username: string | null;
  text: string;
  timestamp: Date | null;
};

export type U = {
  email: string;
  username: string;
  avatarPath: string | null;
  uid: string | null;
  joinedAt: Date | null;
  muted: boolean;
};

export type S = { id: string; uid: string | null; endpoint: string; updatedAt: Date | null };

export type LogEntry = {
  id: string;
  action: string;
  detail: string;
  at: Date | null;
};

export type Announcement = {
  text: string;
  link: string;
  active: boolean;
  updatedAt: Date | null;
};

export type Feedback = {
  id: string;
  uid: string | null;
  username: string;
  email: string;
  text: string;
  at: Date | null;
};

// A member's request to be credited as the owner of an Anonymous post.
// Approving reassigns the photo's userUUID/username; declining just drops it.
export type Claim = {
  id: string;
  postId: string;
  uid: string | null;
  username: string;
  email: string;
  at: Date | null;
};

export type Data = {
  photos: P[];
  comments: C[];
  users: U[];
  subs: S[];
  legacy: Date[];
  log: LogEntry[];
  announcement: Announcement | null;
  feedback: Feedback[];
  claims: Claim[];
};

/* --------------------------------- helpers --------------------------------- */

export const fmtDate = (d: Date | null) =>
  d
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "—";
export const fmtDateTime = (d: Date | null) =>
  d
    ? `${fmtDate(d)}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
    : "—";
export const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
};
export const daysAgo = (n: number) => Date.now() - n * 86_400_000;
export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Every month from the earliest date to now, zero-filled.
export function byMonth(dates: Date[]): { label: string; v: number }[] {
  if (!dates.length) return [];
  const counts = new Map<string, number>();
  for (const d of dates) counts.set(monthKey(d), (counts.get(monthKey(d)) ?? 0) + 1);
  const min = new Date(Math.min(...dates.map((d) => d.getTime())));
  const out: { label: string; v: number }[] = [];
  const cur = new Date(min.getFullYear(), min.getMonth(), 1);
  const now = new Date();
  while (cur <= now) {
    const key = monthKey(cur);
    out.push({ label: monthLabel(key), v: counts.get(key) ?? 0 });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

// Longest / current runs of consecutive days in a set of day keys.
export function streaks(days: Set<string>): { longest: number; current: number } {
  if (!days.size) return { longest: 0, current: 0 };
  const stamps = [...days]
    .map((k) => {
      const [y, m, d] = k.split("-").map(Number);
      return new Date(y, m - 1, d).getTime();
    })
    .sort((a, b) => a - b);
  let longest = 1;
  let run = 1;
  for (let i = 1; i < stamps.length; i++) {
    run = stamps[i] - stamps[i - 1] === 86_400_000 ? run + 1 : 1;
    if (run > longest) longest = run;
  }
  // Current streak must still be alive (today or yesterday).
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const last = stamps[stamps.length - 1];
  let current = 0;
  if (t0 - last <= 86_400_000) {
    current = 1;
    for (let i = stamps.length - 2; i >= 0; i--) {
      if (stamps[i + 1] - stamps[i] === 86_400_000) current++;
      else break;
    }
  }
  return { longest, current };
}

/* ------------------------------- UI primitives ------------------------------ */

export const btn =
  "rounded border-[0.5px] border-edge px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1px] text-mut transition-colors hover:border-mut hover:text-white disabled:opacity-40";
export const btnDanger =
  "rounded border-[0.5px] border-[#5c1a1a] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1px] text-[#e74c3c] transition-colors hover:bg-[#1a0a0a] disabled:opacity-40";
export const btnPrimary =
  "rounded-lg bg-white px-4 py-2 text-xs font-extrabold text-black transition-opacity disabled:opacity-30";
export const inputCls =
  "rounded-lg border-[0.5px] border-edge bg-card px-3 py-2 text-[16px] outline-none placeholder:text-[#2e2e2e] focus:border-mut";

// A titled card. `right` renders controls flush-right in the header row.
export function Section({
  title,
  children,
  desc,
  right,
}: {
  title: string;
  children: React.ReactNode;
  desc?: string;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border-[0.5px] border-field bg-card/40 px-4 py-4 sm:px-5 sm:py-5">
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[11px] font-bold uppercase tracking-[2px] text-mut">{title}</h2>
          {desc && <p className="mt-1 text-[11px] leading-relaxed text-dim">{desc}</p>}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children}
    </section>
  );
}

const TONE: Record<string, string> = {
  gold: "text-[#d4a017]",
  green: "text-[#2ecc71]",
  red: "text-[#e74c3c]",
  heart: "text-heart",
};

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "gold" | "green" | "red" | "heart";
}) {
  return (
    <div className="rounded-xl border-[0.5px] border-field bg-card px-3.5 py-3 transition-colors hover:border-edge">
      <p className={`text-xl font-extrabold tabular-nums tracking-[-0.5px] ${tone ? TONE[tone] : ""}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[1.2px] text-mut">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] leading-snug text-dim">{sub}</p>}
    </div>
  );
}

export function BarChart({
  data,
  height = 110,
}: {
  data: { label: string; v: number }[];
  height?: number;
}) {
  if (!data.length) return <p className="text-xs text-dim">No data.</p>;
  const max = Math.max(...data.map((d) => d.v), 1);
  const bw = 100 / data.length;
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  const H = height / 3;
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 100 ${H}`}
        preserveAspectRatio="none"
        className="h-[110px] w-full min-w-[280px]"
      >
        <line x1={0} y1={H} x2={100} y2={H} className="stroke-white/10" strokeWidth={0.3} />
        {data.map((d, i) => {
          const h = (d.v / max) * (H - 8);
          return (
            <rect
              key={i}
              x={i * bw + bw * 0.15}
              y={H - h}
              width={bw * 0.7}
              height={h}
              rx={0.4}
              className="fill-white/70 transition-[fill] duration-150 hover:fill-white"
            >
              <title>{`${d.label}: ${d.v}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="flex min-w-[280px] justify-between text-[9px] font-semibold uppercase tracking-wide text-dim">
        {data.map((d, i) => (
          <span key={i} className="flex-1 overflow-hidden text-center">
            {i % labelEvery === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

// Single-series area + line with a headline value and an HTML crosshair on
// hover. `tone` is an "r,g,b" string so the fill gradient and stroke share it.
export function AreaChart({
  data,
  height = 128,
  tone = "255,255,255",
  unit = "",
}: {
  data: { label: string; v: number }[];
  height?: number;
  tone?: string;
  unit?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/[:]/g, "");
  if (!data.length) return <p className="text-xs text-dim">No data.</p>;
  const max = Math.max(...data.map((d) => d.v), 1);
  const n = data.length;
  const W = 100;
  const H = 40;
  const px = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const py = (v: number) => H - (v / max) * (H - 3) - 1.5;
  const line = data.map((d, i) => `${px(i).toFixed(2)},${py(d.v).toFixed(2)}`).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;
  const cur = hover != null ? data[hover] : data[n - 1];
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const r = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(r * (n - 1)))));
  };
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-lg font-extrabold tabular-nums tracking-[-0.5px]">
          {cur.v.toLocaleString()}
          {unit}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[1.2px] text-mut">{cur.label}</span>
      </div>
      <div
        className="relative touch-none"
        style={{ height }}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
          <defs>
            <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`rgb(${tone})`} stopOpacity="0.30" />
              <stop offset="100%" stopColor={`rgb(${tone})`} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={area} fill={`url(#g${gid})`} />
          <polyline
            points={line}
            fill="none"
            stroke={`rgb(${tone})`}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
        {hover != null && (
          <>
            <div
              className="pointer-events-none absolute bottom-0 top-0 w-px bg-white/25"
              style={{ left: `${px(hover)}%` }}
            />
            <div
              className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black bg-white"
              style={{ left: `${px(hover)}%`, top: `${(py(cur.v) / H) * 100}%` }}
            />
          </>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[9px] font-semibold uppercase tracking-wide text-dim">
        <span>{data[0].label}</span>
        <span>{data[n - 1].label}</span>
      </div>
    </div>
  );
}

// Horizontal proportion bar with a labelled legend — categorical parts of a
// whole in monochrome (each segment a distinct white step + a 2px gap).
export function StackBar({ segments }: { segments: { label: string; v: number }[] }) {
  const total = segments.reduce((n, s) => n + s.v, 0);
  if (!total) return <p className="text-xs text-dim">No data.</p>;
  const alphas = [0.9, 0.5, 0.25];
  return (
    <div>
      <div className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-full">
        {segments.map((s, i) => (
          <div
            key={s.label}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ width: `${(s.v / total) * 100}%`, background: `rgba(255,255,255,${alphas[i] ?? 0.2})` }}
            title={`${s.label}: ${s.v}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s, i) => (
          <span key={s.label} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ background: `rgba(255,255,255,${alphas[i] ?? 0.2})` }}
            />
            <span className="text-body">{s.label}</span>
            <span className="font-bold tabular-nums">{Math.round((s.v / total) * 100)}%</span>
            <span className="text-dim tabular-nums">({s.v})</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Sticky, horizontally-scrollable pill tab bar. Sits just under the fixed TopNav.
export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string; badge?: number }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="sticky top-[calc(52px+env(safe-area-inset-top))] z-30 border-b-[0.5px] border-line bg-canvas/90 backdrop-blur">
      <div className="flex gap-1.5 overflow-x-auto px-3 py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[1px] transition-colors ${
                on ? "bg-white text-black" : "border-[0.5px] border-edge text-mut hover:text-white"
              }`}
            >
              {t.label}
              {t.badge ? (
                <span
                  className={`rounded-full px-1.5 py-px text-[9px] tabular-nums ${
                    on ? "bg-black text-white" : "bg-heart text-white"
                  }`}
                >
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// GitHub-style calendar heatmap of the last `weeks` weeks.
export function Heatmap({ counts, weeks = 26 }: { counts: Map<string, number>; weeks?: number }) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() - (weeks * 7 - 1));
  start.setDate(start.getDate() - start.getDay()); // back to Sunday
  const cols = Math.ceil((today.getTime() - start.getTime()) / (7 * 86_400_000)) + 1;
  const max = Math.max(1, ...counts.values());
  const cells: React.ReactNode[] = [];
  const monthMarks: { x: number; label: string }[] = [];
  let lastMonth = -1;
  for (let w = 0; w < cols; w++) {
    for (let d = 0; d < 7; d++) {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      if (day > today) continue;
      if (d === 0 && day.getMonth() !== lastMonth) {
        lastMonth = day.getMonth();
        monthMarks.push({
          x: w,
          label: day.toLocaleDateString(undefined, { month: "short" }),
        });
      }
      const v = counts.get(dayKey(day)) ?? 0;
      const alpha = v === 0 ? 0.05 : 0.25 + 0.75 * Math.min(1, v / max);
      cells.push(
        <rect
          key={`${w}-${d}`}
          x={w * 12}
          y={d * 12}
          width={10}
          height={10}
          rx={2}
          fill={`rgba(255,255,255,${alpha.toFixed(2)})`}
        >
          <title>{`${fmtDate(day)}: ${v}`}</title>
        </rect>
      );
    }
  }
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${cols * 12} ${7 * 12 + 14}`}
        className="h-[110px] min-w-[560px]"
        preserveAspectRatio="xMinYMin meet"
      >
        {cells}
        {monthMarks.map((mk) => (
          <text
            key={mk.x}
            x={mk.x * 12}
            y={7 * 12 + 10}
            className="fill-[#444444]"
            fontSize={8}
            fontWeight={600}
          >
            {mk.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function Board({ title, rows }: { title: string; rows: [string, string | number][] }) {
  return (
    <div className="rounded-lg border-[0.5px] border-field bg-card p-3.5">
      <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[1.5px] text-mut">{title}</p>
      {rows.length === 0 && <p className="text-xs text-dim">—</p>}
      <ol className="flex flex-col gap-1.5">
        {rows.map(([name, v], i) => (
          <li key={i} className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate">
              <span className="mr-1.5 text-[10px] font-bold text-dim">{i + 1}</span>
              {name}
            </span>
            <span className="shrink-0 font-bold tabular-nums">{v}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Thumb({ path }: { path: string }) {
  const src = useAuthedImage(path, true);
  return (
    <div className="h-11 w-11 shrink-0 overflow-hidden rounded bg-field">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      )}
    </div>
  );
}
