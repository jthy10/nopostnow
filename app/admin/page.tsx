"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  EmailAuthProvider,
  getMultiFactorResolver,
  multiFactor,
  reauthenticateWithCredential,
  sendEmailVerification,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import QRCode from "qrcode";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import TopNav from "@/components/TopNav";
import {
  type Announcement,
  type C,
  type Claim,
  type Data,
  type LogEntry,
  type P,
  type S,
  type U,
  AreaChart,
  BarChart,
  Board,
  Heatmap,
  Section,
  StackBar,
  Stat,
  TabBar,
  Thumb,
  btn,
  btnDanger,
  btnPrimary,
  byMonth,
  dayKey,
  daysAgo,
  fmtDate,
  fmtDateTime,
  inputCls,
  monthKey,
  monthLabel,
  pct,
  streaks,
} from "./shared";

/* ---------------------------- content analytics ---------------------------- */

const STOPWORDS = new Set(
  "the a an and or but of to in on at is it its im was for with this that you your are be we our us my me i so not just too have has had do dont did what when how who all out up from they them he she his her got get as if by no yes oh one can will about there here really very much more some than then now when were been being over after before because there's ur u r im".split(
    " "
  )
);

function topWords(texts: string[], n: number): [string, number][] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    const words = t.toLowerCase().replace(/[’']/g, "").match(/[a-z]{3,}/g) ?? [];
    for (const w of words) {
      if (STOPWORDS.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function topEmoji(texts: string[], n: number): [string, number][] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    for (const m of t.matchAll(/\p{Extended_Pictographic}/gu)) {
      counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

// Distinct active people (posted or commented) per month, zero-filled.
function activeMembersMonthly(photos: P[], comments: C[]): { label: string; v: number }[] {
  const byM = new Map<string, Set<string>>();
  const add = (d: Date | null, name: string | null) => {
    if (!d || !name) return;
    const k = monthKey(d);
    if (!byM.has(k)) byM.set(k, new Set());
    byM.get(k)!.add(name);
  };
  for (const p of photos) add(p.timestamp, p.username);
  for (const c of comments) add(c.timestamp, c.username);
  if (!byM.size) return [];
  const keys = [...byM.keys()].sort();
  const [y0, m0] = keys[0].split("-").map(Number);
  const cur = new Date(y0, m0 - 1, 1);
  const now = new Date();
  const out: { label: string; v: number }[] = [];
  while (cur <= now) {
    const k = monthKey(cur);
    out.push({ label: monthLabel(k), v: byM.get(k)?.size ?? 0 });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

function downloadBlob(name: string, mime: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const csvCell = (v: string | number | null | undefined) =>
  `"${String(v ?? "").replace(/"/g, '""')}"`;

/* ------------------------- TOTP 2FA enrollment card ------------------------- */

function TotpEnrollCard({ user, onEnrolled }: { user: User; onEnrolled: () => void }) {
  const [step, setStep] = useState<"idle" | "verify-email" | "scan">("idle");
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setMsg(null);
    try {
      await user.reload();
      if (!user.emailVerified) {
        setStep("verify-email");
        return;
      }
      const session = await multiFactor(user).getSession();
      const s = await TotpMultiFactorGenerator.generateSecret(session);
      setSecret(s);
      setQr(await QRCode.toDataURL(s.generateQrCodeUrl(user.email!, "NoPostNow"), { margin: 1, width: 220 }));
      setStep("scan");
    } catch (e) {
      setMsg(
        e instanceof FirebaseError && e.code === "auth/operation-not-allowed"
          ? "TOTP isn't enabled on the Firebase project yet."
          : e instanceof Error
            ? e.message
            : "Couldn't start setup."
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendVerify() {
    setBusy(true);
    try {
      await sendEmailVerification(user);
      setMsg(`Verification email sent to ${user.email}. Click the link, then hit “I've verified”.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't send the email.");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!secret) return;
    setBusy(true);
    setMsg(null);
    try {
      await multiFactor(user).enroll(
        TotpMultiFactorGenerator.assertionForEnrollment(secret, code.trim()),
        "Authenticator app"
      );
      onEnrolled();
    } catch {
      setMsg("Wrong code — check the app and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-4 mt-5 rounded-lg border-[0.5px] border-[#5c4a1a] bg-[#161206] p-4">
      <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#d4a017]">
        Two-factor authentication is off
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-mut">
        Add an authenticator app (Google Authenticator, 1Password, Apple Passwords…) so
        logging in to this account always needs a 6-digit code.
      </p>
      {msg && <p className="mt-2.5 text-xs leading-relaxed text-[#d4a017]">{msg}</p>}

      {step === "idle" && (
        <button onClick={start} disabled={busy} className={`mt-3 rounded border-[0.5px] border-edge px-3 py-1.5 text-[10px] font-bold uppercase tracking-[1px] text-white transition-colors hover:border-mut disabled:opacity-40`}>
          Set up 2FA
        </button>
      )}

      {step === "verify-email" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={sendVerify} disabled={busy} className="rounded border-[0.5px] border-edge px-3 py-1.5 text-[10px] font-bold uppercase tracking-[1px] text-white transition-colors hover:border-mut disabled:opacity-40">
            Send verification email
          </button>
          <button onClick={start} disabled={busy} className="rounded border-[0.5px] border-edge px-3 py-1.5 text-[10px] font-bold uppercase tracking-[1px] text-mut transition-colors hover:border-mut hover:text-white disabled:opacity-40">
            I&apos;ve verified — continue
          </button>
        </div>
      )}

      {step === "scan" && secret && (
        <div className="mt-3.5">
          <p className="text-xs leading-relaxed text-mut">
            1. Scan this with your authenticator app (or enter the key manually).
          </p>
          {qr && (
            <div className="mt-2.5 inline-block rounded-lg bg-white p-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="TOTP QR code" className="h-[180px] w-[180px]" />
            </div>
          )}
          <p className="mt-2 break-all text-[10px] text-dim">
            Manual key: <span className="font-mono text-mut">{secret.secretKey}</span>
          </p>
          <p className="mt-3 text-xs leading-relaxed text-mut">2. Enter the 6-digit code it shows:</p>
          <div className="mt-2 flex gap-2">
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="w-32 rounded-lg border-[0.5px] border-edge bg-card px-3 py-2 text-center text-[16px] tracking-[4px] outline-none focus:border-mut"
            />
            <button
              onClick={finish}
              disabled={busy || code.length !== 6}
              className="rounded-lg bg-white px-4 text-xs font-extrabold text-black transition-opacity disabled:opacity-30"
            >
              Enable
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ security panel ------------------------------ */

const SESSION_SECONDS = 900; // must match freshAdmin() in firestore.rules

function SecurityPanel({
  user,
  unlockedAt,
  onLock,
}: {
  user: User;
  unlockedAt: number;
  onLock: (reason?: string) => void;
}) {
  // Seeded from the unlock timestamp (a prop, so render stays pure); the
  // interval takes over one second later.
  const [now, setNow] = useState(unlockedAt);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, SESSION_SECONDS - Math.floor((now - unlockedAt) / 1000));
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const factors = multiFactor(user).enrolledFactors;

  return (
    <Section title="Security">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <div className="rounded-lg border-[0.5px] border-field bg-card px-3.5 py-3">
          <p
            className={`text-xl font-extrabold tabular-nums tracking-[-0.5px] ${
              remaining === 0 ? "text-[#e74c3c]" : remaining < 120 ? "text-[#d4a017]" : ""
            }`}
          >
            {remaining === 0 ? "Expired" : `${mm}:${ss}`}
          </p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[1.2px] text-mut">
            Action window
          </p>
          <p className="mt-0.5 text-[10px] text-dim">
            {remaining === 0
              ? "mutations now rejected server-side"
              : "server rejects mutations after this"}
          </p>
        </div>
        <Stat
          label="2FA"
          value={factors.length ? "On" : "Off"}
          sub={
            factors.length
              ? factors
                  .map((f) => `${f.displayName ?? f.factorId} · since ${fmtDate(new Date(f.enrollmentTime))}`)
                  .join(", ")
              : "TOTP becomes mandatory Jul 21 2026"
          }
        />
        <Stat
          label="Verified email"
          value={user.emailVerified ? "Yes" : "No"}
          sub={user.email ?? undefined}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {remaining === 0 ? (
          <button onClick={() => onLock("Admin session expired — re-enter your password.")} className={btn}>
            Re-unlock
          </button>
        ) : (
          <button onClick={() => onLock()} className={btn}>
            Lock now
          </button>
        )}
      </div>
    </Section>
  );
}

/* ----------------------------- broadcast composer ---------------------------- */

function BroadcastComposer({
  user,
  deviceCount,
  onSent,
}: {
  user: User;
  deviceCount: number;
  onSent: (message: string, result: string, test: boolean) => void;
}) {
  const [title, setTitle] = useState("NoPostNow");
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function send(test: boolean) {
    if (!message.trim()) return;
    if (
      !test &&
      !confirm(
        `Send this push notification to all ${deviceCount} subscribed devices?\n\n${title}\n${message.trim()}`
      )
    )
      return;
    setBusy(true);
    setResult(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, message: message.trim(), url: url.trim() || undefined, test }),
      });
      const json = (await res.json()) as { sent?: number; stale?: number; error?: string };
      if (!res.ok) throw new Error(json.error || "Send failed.");
      const summary = `Sent to ${json.sent} device${json.sent === 1 ? "" : "s"}${
        json.stale ? ` · ${json.stale} stale removed` : ""
      }${test ? " (test — your devices only)" : ""}`;
      setResult(summary);
      onSent(message.trim(), summary, test);
      if (!test) setMessage("");
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Broadcast push notification">
      <div className="flex flex-col gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={40}
          placeholder="Title"
          className={inputCls}
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={160}
          rows={3}
          placeholder="Message — lands on every subscribed lock screen…"
          className={`${inputCls} resize-none`}
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Open path when tapped (optional, e.g. /profile — defaults to feed)"
          className={inputCls}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => send(false)}
            disabled={busy || !message.trim()}
            className={btnPrimary}
          >
            Send to all {deviceCount} devices
          </button>
          <button onClick={() => send(true)} disabled={busy || !message.trim()} className={btn}>
            Test on my devices
          </button>
          <span className="text-[10px] tabular-nums text-dim">{message.length}/160</span>
        </div>
        {result && <p className="text-xs text-mut">{result}</p>}
      </div>
    </Section>
  );
}

/* ---------------------------- announcement manager --------------------------- */

function AnnouncementManager({
  initial,
  onSave,
}: {
  initial: Announcement | null;
  onSave: (text: string, link: string, active: boolean) => Promise<void>;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [link, setLink] = useState(initial?.link ?? "");
  const [active, setActive] = useState(initial?.active ?? false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(nextActive: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      await onSave(text.trim(), link.trim(), nextActive);
      setActive(nextActive);
      setMsg(nextActive ? "Live — pinned to the top of everyone's feed." : "Taken down.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Feed announcement">
      <p className="mb-3 text-[11px] leading-relaxed text-dim">
        A pinned card at the top of the feed. Members can dismiss it; publishing again
        brings it back for everyone.
        {active && <span className="ml-1.5 font-bold text-[#2ecc71]">● Currently live</span>}
      </p>
      <div className="flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="Announcement text…"
          className={`${inputCls} resize-none`}
        />
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Link path (optional, e.g. /profile)"
          className={inputCls}
        />
        {text.trim() && (
          <div className="rounded-lg border-[0.5px] border-edge bg-card p-4">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[1.5px] text-mut">NoPostNow</p>
            <p className="text-[13px] leading-relaxed text-body">{text.trim()}</p>
            {link.trim() && (
              <span className="mt-1.5 inline-block text-[11px] font-bold uppercase tracking-[1px]">
                Open →
              </span>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => save(true)} disabled={busy || !text.trim()} className={btnPrimary}>
            {active ? "Update" : "Publish"}
          </button>
          {active && (
            <button onClick={() => save(false)} disabled={busy} className={btnDanger}>
              Take down
            </button>
          )}
        </div>
        {msg && <p className="text-xs text-mut">{msg}</p>}
      </div>
    </Section>
  );
}

/* ------------------------------- member detail ------------------------------- */

function MemberDetail({
  u,
  data,
  live,
  onDeletePost,
}: {
  u: U;
  data: Data;
  live: P[];
  onDeletePost: (p: P) => void;
}) {
  const posts = live.filter((p) => p.username === u.username);
  const comments = data.comments.filter((c) => c.username === u.username);
  const likesGiven = u.uid
    ? live.reduce((n, p) => n + (p.likedBy.includes(u.uid!) ? 1 : 0), 0)
    : 0;
  const likesRecv = posts.reduce((n, p) => n + p.likedBy.length, 0);
  const devices = u.uid ? data.subs.filter((s) => s.uid === u.uid) : [];
  const activity = [
    ...posts.map((p) => p.timestamp),
    ...comments.map((c) => c.timestamp),
  ].filter((d): d is Date => !!d);
  const lastActive = activity.length
    ? new Date(Math.max(...activity.map((d) => d.getTime())))
    : null;
  const postDays = new Set(posts.filter((p) => p.timestamp).map((p) => dayKey(p.timestamp!)));
  const { longest } = streaks(postDays);

  return (
    <div className="rounded-lg border-[0.5px] border-field bg-card p-3.5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] sm:grid-cols-3">
        {(
          [
            ["Joined", fmtDate(u.joinedAt)],
            ["Last active", fmtDateTime(lastActive)],
            ["First post", fmtDate(posts.at(-1)?.timestamp ?? null)],
            ["Latest post", fmtDate(posts[0]?.timestamp ?? null)],
            ["Posts", posts.length],
            ["Comments", comments.length],
            ["Likes given", likesGiven],
            ["Likes received", likesRecv],
            ["Avg ♥ / post", posts.length ? (likesRecv / posts.length).toFixed(1) : "—"],
            ["Longest streak", longest ? `${longest} day${longest === 1 ? "" : "s"}` : "—"],
            ["Push devices", devices.length],
            ["Days active", new Set(activity.map((d) => dayKey(d))).size],
          ] as [string, string | number][]
        ).map(([k, v]) => (
          <p key={k} className="flex justify-between gap-2 border-b-[0.5px] border-field pb-1">
            <span className="text-dim">{k}</span>
            <span className="font-bold tabular-nums">{v}</span>
          </p>
        ))}
      </div>
      {posts.length > 0 && (
        <>
          <p className="mb-1.5 mt-3 text-[10px] font-bold uppercase tracking-[1.5px] text-mut">
            Recent posts
          </p>
          <div className="flex flex-wrap gap-2">
            {posts.slice(0, 8).map((p) => (
              <div key={p.id} className="flex flex-col items-center gap-1">
                {p.imagePath && <Thumb path={p.imagePath} />}
                <button onClick={() => onDeletePost(p)} className="text-[9px] font-bold uppercase tracking-[1px] text-[#e74c3c]">
                  Delete
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------- the page --------------------------------- */

type TabId =
  | "overview"
  | "approvals"
  | "analytics"
  | "leaderboards"
  | "members"
  | "moderation"
  | "broadcast"
  | "system";

export default function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  const [unlockedAt, setUnlockedAt] = useState(0);
  const [password, setPassword] = useState("");
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateBusy, setGateBusy] = useState(false);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [enrolledBump, setEnrolledBump] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // posts manager state
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"new" | "liked" | "commented">("new");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const PER_PAGE = 15;

  // comment browser state
  const [cSearch, setCSearch] = useState("");
  const [cPage, setCPage] = useState(0);
  const C_PER_PAGE = 20;

  // members
  const [openMember, setOpenMember] = useState<string | null>(null);

  // approvals (claim queue) multi-select
  const [selectedClaims, setSelectedClaims] = useState<Set<string>>(new Set());

  // active tab
  const [tab, setTab] = useState<TabId>("overview");

  const logCounter = useRef(0);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  function lock(reason?: string) {
    setUnlocked(false);
    setData(null);
    setGateError(reason ?? null);
  }

  // Step-up: reauthenticate refreshes auth_time, which the freshAdmin() rule
  // checks server-side. Browsing works on the old session; mutating doesn't.
  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.email) return;
    setGateBusy(true);
    setGateError(null);
    try {
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, password)
      );
      await user.getIdToken(true);
      setPassword("");
      setUnlockedAt(Date.now());
      setUnlocked(true);
    } catch (e) {
      // 2FA enrolled: password was right, the authenticator code is still owed.
      if (e instanceof FirebaseError && e.code === "auth/multi-factor-auth-required") {
        setMfaResolver(getMultiFactorResolver(auth, e as MultiFactorError));
      } else {
        setGateError("Wrong password.");
      }
    } finally {
      setGateBusy(false);
    }
  }

  async function unlockTotp(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaResolver || !user) return;
    setGateBusy(true);
    setGateError(null);
    try {
      const totpHint = mfaResolver.hints.find(
        (h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID
      );
      if (!totpHint) throw new Error("No authenticator enrolled.");
      await mfaResolver.resolveSignIn(
        TotpMultiFactorGenerator.assertionForSignIn(totpHint.uid, totpCode.trim())
      );
      await user.getIdToken(true);
      setMfaResolver(null);
      setTotpCode("");
      setPassword("");
      setUnlockedAt(Date.now());
      setUnlocked(true);
    } catch {
      setGateError("Wrong code — check your authenticator app.");
    } finally {
      setGateBusy(false);
    }
  }

  useEffect(() => {
    if (!unlocked || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const [
          photosSnap,
          commentsSnap,
          usersSnap,
          subsSnap,
          legacySnap,
          logSnap,
          annSnap,
          fbSnap,
          claimsSnap,
        ] = await Promise.all([
          getDocs(collection(db, "photos")),
          getDocs(collectionGroup(db, "comments")),
          getDocs(collection(db, "users")),
          getDocs(collection(db, "pushSubscriptions")),
          getDocs(collection(db, "unique_users")),
          getDocs(collection(db, "adminLog")),
          getDoc(doc(db, "config", "announcement")),
          getDocs(collection(db, "feedback")),
          getDocs(collection(db, "claims")),
        ]);
        if (cancelled) return;
        setData({
          photos: photosSnap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              userUUID: x.userUUID ?? null,
              username: x.username ?? null,
              imagePath: x.imagePath,
              caption: x.caption,
              timestamp: x.timestamp?.toDate?.() ?? null,
              likedBy: Array.isArray(x.likedBy) ? x.likedBy : [],
              imageWidth: x.imageWidth,
              imageHeight: x.imageHeight,
              deleted: x.deleted === true,
              deletedAt: x.deletedAt?.toDate?.() ?? null,
              keys: Object.keys(x),
            };
          }),
          comments: commentsSnap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              postId: d.ref.parent.parent!.id,
              userUUID: x.userUUID ?? null,
              username: x.username ?? null,
              text: x.text ?? "",
              timestamp: x.timestamp?.toDate?.() ?? null,
            };
          }),
          users: usersSnap.docs.map((d) => {
            const x = d.data();
            return {
              email: d.id,
              username: x.username ?? d.id,
              avatarPath: x.avatarPath ?? null,
              uid: x.uid ?? null,
              joinedAt: x.joinedAt?.toDate?.() ?? x.createdAt?.toDate?.() ?? null,
              muted: x.muted === true,
            };
          }),
          subs: subsSnap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              uid: x.uid ?? null,
              endpoint: x.endpoint ?? "",
              updatedAt: x.updatedAt?.toDate?.() ?? null,
            };
          }),
          legacy: legacySnap.docs
            .map((d) => d.data().firstJoined?.toDate?.() ?? null)
            .filter((d): d is Date => d !== null),
          log: logSnap.docs
            .map((d) => {
              const x = d.data();
              return {
                id: d.id,
                action: x.action ?? "?",
                detail: x.detail ?? "",
                at: x.at?.toDate?.() ?? null,
              };
            })
            .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0)),
          feedback: fbSnap.docs
            .map((d) => {
              const x = d.data();
              return {
                id: d.id,
                uid: x.uid ?? null,
                username: x.username ?? "?",
                email: x.email ?? "",
                text: x.text ?? "",
                at: x.at?.toDate?.() ?? null,
              };
            })
            .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0)),
          announcement: annSnap.exists()
            ? {
                text: annSnap.data().text ?? "",
                link: annSnap.data().link ?? "",
                active: annSnap.data().active === true,
                updatedAt: annSnap.data().updatedAt?.toDate?.() ?? null,
              }
            : null,
          claims: claimsSnap.docs
            .map((d) => {
              const x = d.data();
              return {
                id: d.id,
                postId: x.postId ?? "",
                uid: x.uid ?? null,
                username: x.username ?? "?",
                email: x.email ?? "",
                at: x.at?.toDate?.() ?? null,
              };
            })
            .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0)),
        });
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unlocked, user]);

  /* ------------------------------ derived stats ------------------------------ */

  const m = useMemo(() => {
    if (!data) return null;
    const live = data.photos
      .filter((p) => p.timestamp && p.imagePath && !p.deleted)
      .sort((a, b) => b.timestamp!.getTime() - a.timestamp!.getTime());
    const dead = data.photos.filter((p) => (!p.timestamp || !p.imagePath) && !p.deleted);
    // Soft-deleted by their owner (or an admin) — recoverable from here.
    const trashed = data.photos
      .filter((p) => p.deleted)
      .sort((a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0));

    // uid -> display name (user docs self-heal uid; posts cover the rest)
    const uidName = new Map<string, string>();
    for (const p of live) if (p.userUUID && p.username) uidName.set(p.userUUID, p.username);
    for (const u of data.users) if (u.uid) uidName.set(u.uid, u.username);
    const nameOf = (uid: string | null) =>
      (uid && uidName.get(uid)) || (uid ? `${uid.slice(0, 8)}…` : "Anonymous");

    const commentsByPost = new Map<string, number>();
    for (const c of data.comments)
      commentsByPost.set(c.postId, (commentsByPost.get(c.postId) ?? 0) + 1);

    const count = <T,>(items: T[], key: (t: T) => string | null) => {
      const map = new Map<string, number>();
      for (const it of items) {
        const k = key(it);
        if (k) map.set(k, (map.get(k) ?? 0) + 1);
      }
      return [...map.entries()].sort((a, b) => b[1] - a[1]);
    };

    const totalLikes = live.reduce((n, p) => n + p.likedBy.length, 0);
    const captioned = live.filter((p) => p.caption?.trim());
    const postDates = live.map((p) => p.timestamp!);

    const perDay = count(live, (p) => p.timestamp!.toDateString());
    const hourHist = Array.from({ length: 24 }, (_, h) => ({
      label: `${h}`,
      v: live.filter((p) => p.timestamp!.getHours() === h).length,
    }));
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weekdayHist = dayNames.map((label, i) => ({
      label,
      v: live.filter((p) => p.timestamp!.getDay() === i).length,
    }));

    // cumulative legacy visitor growth
    const legacyMonthly = byMonth(data.legacy);
    let acc = 0;
    const legacyGrowth = legacyMonthly.map((x) => ({ label: x.label, v: (acc += x.v) }));

    // cumulative posts growth
    const postsMonthly = byMonth(postDates);
    let pacc = 0;
    const postsGrowth = postsMonthly.map((x) => ({ label: x.label, v: (pacc += x.v) }));

    const likesReceived = count(live, (p) => p.username || "Anonymous").map(
      ([name]) =>
        [
          name,
          live
            .filter((p) => (p.username || "Anonymous") === name)
            .reduce((n, p) => n + p.likedBy.length, 0),
        ] as [string, number]
    );
    likesReceived.sort((a, b) => b[1] - a[1]);

    const likesGiven = count(
      live.flatMap((p) => p.likedBy),
      (uid) => nameOf(uid)
    );

    const activeSince30 = new Set([
      ...live.filter((p) => p.timestamp!.getTime() > daysAgo(30)).map((p) => p.username || ""),
      ...data.comments
        .filter((c) => c.timestamp && c.timestamp.getTime() > daysAgo(30))
        .map((c) => c.username || ""),
    ]);
    activeSince30.delete("");

    // ---- new: streaks, heatmap, activity, content, health ----

    const postDaySet = new Set(postDates.map((d) => dayKey(d)));
    const siteStreaks = streaks(postDaySet);
    const lastPost = live[0]?.timestamp ?? null;
    const daysSinceLastPost = lastPost
      ? Math.floor((daysAgo(0) - lastPost.getTime()) / 86_400_000)
      : null;

    const heatCounts = new Map<string, number>();
    for (const d of postDates) heatCounts.set(dayKey(d), (heatCounts.get(dayKey(d)) ?? 0) + 1);
    for (const c of data.comments)
      if (c.timestamp)
        heatCounts.set(dayKey(c.timestamp), (heatCounts.get(dayKey(c.timestamp)) ?? 0) + 1);

    // per-user longest posting streaks
    const daysByUser = new Map<string, Set<string>>();
    for (const p of live) {
      const name = p.username || "Anonymous";
      if (!daysByUser.has(name)) daysByUser.set(name, new Set());
      daysByUser.get(name)!.add(dayKey(p.timestamp!));
    }
    const userStreaks = [...daysByUser.entries()]
      .map(([name, days]) => [name, streaks(days).longest] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([n, v]) => [n, `${v} day${v === 1 ? "" : "s"}`] as [string, string]);

    const nightOwls = count(
      live.filter((p) => p.timestamp!.getHours() < 6),
      (p) => p.username || "Anonymous"
    ).slice(0, 8);

    // last activity per username (posts + comments)
    const lastActive = new Map<string, Date>();
    const bump = (name: string | null, d: Date | null) => {
      if (!name || !d) return;
      const cur = lastActive.get(name);
      if (!cur || d > cur) lastActive.set(name, d);
    };
    for (const p of live) bump(p.username, p.timestamp);
    for (const c of data.comments) bump(c.username, c.timestamp);

    const lurkers = data.users.filter(
      (u) =>
        !live.some((p) => p.username === u.username) &&
        !data.comments.some((c) => c.username === u.username)
    );

    // content analytics
    const captionTexts = captioned.map((p) => p.caption!);
    const commentTexts = data.comments.map((c) => c.text);
    const words = topWords([...captionTexts, ...commentTexts], 14);
    const emoji = topEmoji([...captionTexts, ...commentTexts], 8);
    const avgCommentLen = data.comments.length
      ? Math.round(commentTexts.reduce((n, t) => n + t.length, 0) / data.comments.length)
      : 0;

    // aspect ratios
    const withDims = live.filter((p) => p.imageWidth && p.imageHeight);
    const aspect = { portrait: 0, landscape: 0, square: 0 };
    for (const p of withDims) {
      const r = p.imageWidth! / p.imageHeight!;
      if (r > 1.05) aspect.landscape++;
      else if (r < 0.95) aspect.portrait++;
      else aspect.square++;
    }

    // data health
    const liveIds = new Set(data.photos.map((p) => p.id));
    const orphanComments = data.comments.filter((c) => !liveIds.has(c.postId));
    const knownUids = new Set(uidName.keys());
    const ghostLikes = live.reduce(
      (n, p) => n + p.likedBy.filter((uid) => !knownUids.has(uid)).length,
      0
    );

    return {
      live,
      dead,
      trashed,
      nameOf,
      commentsByPost,
      totalLikes,
      captioned,
      perDay,
      hourHist,
      weekdayHist,
      legacyGrowth,
      postsGrowth,
      postsMonthly,
      commentsMonthly: byMonth(
        data.comments.map((c) => c.timestamp).filter((d): d is Date => !!d)
      ),
      activeMonthly: activeMembersMonthly(live, data.comments),
      topPosters: count(live, (p) => p.username || "Anonymous").slice(0, 8),
      topCommenters: count(data.comments, (c) => c.username).slice(0, 8),
      likesGiven: likesGiven.slice(0, 8),
      likesReceived: likesReceived.slice(0, 8),
      userStreaks,
      nightOwls,
      topLiked: [...live].sort((a, b) => b.likedBy.length - a.likedBy.length).slice(0, 5),
      topCommented: [...live]
        .sort((a, b) => (commentsByPost.get(b.id) ?? 0) - (commentsByPost.get(a.id) ?? 0))
        .slice(0, 5),
      posts7: live.filter((p) => p.timestamp!.getTime() > daysAgo(7)).length,
      posts30: live.filter((p) => p.timestamp!.getTime() > daysAgo(30)).length,
      comments30: data.comments.filter((c) => c.timestamp && c.timestamp.getTime() > daysAgo(30))
        .length,
      activeSince30: activeSince30.size,
      noDims: live.filter((p) => !p.imageWidth).length,
      anonPosts: live.filter((p) => !p.userUUID).length,
      siteStreaks,
      daysSinceLastPost,
      heatCounts,
      lastActive,
      lurkers,
      words,
      emoji,
      avgCommentLen,
      aspect,
      withDims: withDims.length,
      orphanComments,
      ghostLikes,
    };
  }, [data]);

  /* ------------------------------ admin actions ------------------------------ */

  // Append-only audit trail — rules allow create (never update/delete) and
  // only within the fresh-admin window. Fire-and-forget: logging must never
  // block the action it describes.
  function log(action: string, detail: string) {
    void addDoc(collection(db, "adminLog"), {
      action,
      detail: detail.slice(0, 300),
      email: user?.email || "",
      at: serverTimestamp(),
    }).catch(() => {});
    const entry: LogEntry = {
      id: `local-${logCounter.current++}`,
      action,
      detail: detail.slice(0, 300),
      at: new Date(),
    };
    setData((d) => d && { ...d, log: [entry, ...d.log] });
  }

  // freshAdmin() expired server-side → force the password gate again.
  function handleActionError(e: unknown) {
    if (e instanceof Error && /permission/i.test(e.message)) {
      lock("Admin session expired — re-enter your password.");
    } else {
      alert(e instanceof Error ? e.message : "Action failed.");
    }
  }

  // Deletes the photo doc and its comment subcollection (otherwise the
  // comments linger as orphans that only show up in Data health).
  async function deletePostAndComments(p: P) {
    if (!data) return;
    for (const c of data.comments.filter((c) => c.postId === p.id)) {
      await deleteDoc(doc(db, "photos", p.id, "comments", c.id));
    }
    await deleteDoc(doc(db, "photos", p.id));
  }

  async function adminDeletePost(p: P) {
    if (!confirm(`Delete this post by ${p.username || "Anonymous"}? This can't be undone.`))
      return;
    try {
      await deletePostAndComments(p);
      setData(
        (d) =>
          d && {
            ...d,
            photos: d.photos.filter((x) => x.id !== p.id),
            comments: d.comments.filter((c) => c.postId !== p.id),
          }
      );
      log("delete-post", `${p.username || "Anonymous"} — ${p.caption || "(no caption)"} · ${p.id}`);
    } catch (e) {
      handleActionError(e);
    }
  }

  async function bulkDeletePosts() {
    if (!m || selected.size === 0) return;
    const targets = m.live.filter((p) => selected.has(p.id));
    if (
      !confirm(`Delete ${targets.length} selected posts? This can't be undone.`) ||
      !confirm("Really sure? This permanently deletes them and their comments.")
    )
      return;
    try {
      for (const p of targets) await deletePostAndComments(p);
      const ids = new Set(targets.map((p) => p.id));
      setData(
        (d) =>
          d && {
            ...d,
            photos: d.photos.filter((x) => !ids.has(x.id)),
            comments: d.comments.filter((c) => !ids.has(c.postId)),
          }
      );
      setSelected(new Set());
      log("bulk-delete-posts", `${targets.length} posts`);
    } catch (e) {
      handleActionError(e);
    }
  }

  async function adminDeleteComment(c: C) {
    if (!confirm(`Delete this comment by ${c.username}?`)) return;
    try {
      await deleteDoc(doc(db, "photos", c.postId, "comments", c.id));
      setData((d) => d && { ...d, comments: d.comments.filter((x) => x.id !== c.id) });
      log("delete-comment", `${c.username}: “${c.text.slice(0, 80)}”`);
    } catch (e) {
      handleActionError(e);
    }
  }

  async function adminDeleteSub(s: S) {
    if (!confirm("Remove this push device? They can re-enable it in the app.")) return;
    try {
      await deleteDoc(doc(db, "pushSubscriptions", s.id));
      setData((d) => d && { ...d, subs: d.subs.filter((x) => x.id !== s.id) });
      log("remove-device", `${m?.nameOf(s.uid) ?? s.uid ?? "unknown"} · ${new URL(s.endpoint).hostname}`);
    } catch (e) {
      handleActionError(e);
    }
  }

  async function adminRename(u: U) {
    const next = prompt(
      `New username for ${u.email}?\n(All their old posts and comments get the new name too.)`,
      u.username
    )?.trim();
    if (!next || next === u.username || !data) return;
    if (
      data.users.some(
        (x) => x.email !== u.email && x.username.toLowerCase() === next.toLowerCase()
      )
    ) {
      alert(`“${next}” is already taken by another member.`);
      return;
    }
    try {
      await Promise.all([
        setDoc(doc(db, "users", u.email), { username: next }, { merge: true }),
        ...(u.uid
          ? [
              setDoc(
                doc(db, "publicProfiles", u.uid),
                { uid: u.uid, username: next },
                { merge: true }
              ),
            ]
          : []),
      ]);
      // Restamp their old posts and comments (matched by uid when the doc
      // has one, else by the old username — pre-self-heal accounts).
      const myPost = (p: P) => (u.uid ? p.userUUID === u.uid : p.username === u.username);
      const myComment = (c: C) => (u.uid ? c.userUUID === u.uid : c.username === u.username);
      const results = await Promise.allSettled([
        ...data.photos.filter(myPost).map((p) =>
          setDoc(doc(db, "photos", p.id), { username: next }, { merge: true })
        ),
        ...data.comments.filter(myComment).map((c) =>
          setDoc(doc(db, "photos", c.postId, "comments", c.id), { username: next }, { merge: true })
        ),
      ]);
      const failed = results.filter((r) => r.status === "rejected").length;
      setData(
        (d) =>
          d && {
            ...d,
            users: d.users.map((x) => (x.email === u.email ? { ...x, username: next } : x)),
            photos: d.photos.map((p) => (myPost(p) ? { ...p, username: next } : p)),
            comments: d.comments.map((c) => (myComment(c) ? { ...c, username: next } : c)),
          }
      );
      log(
        "rename-user",
        `${u.email}: ${u.username} → ${next} (${results.length - failed} posts/comments restamped${failed ? `, ${failed} failed` : ""})`
      );
      if (failed) alert(`${failed} old posts/comments couldn't be updated — rerun the rename to retry.`);
    } catch (e) {
      handleActionError(e);
    }
  }

  async function adminRecoverPost(p: P) {
    try {
      await setDoc(doc(db, "photos", p.id), { deleted: false }, { merge: true });
      setData(
        (d) =>
          d && {
            ...d,
            photos: d.photos.map((x) => (x.id === p.id ? { ...x, deleted: false } : x)),
          }
      );
      log("recover-post", `${p.username || "Anonymous"} — ${p.caption || "(no caption)"} · ${p.id}`);
    } catch (e) {
      handleActionError(e);
    }
  }

  async function adminDeleteFeedback(id: string) {
    if (!confirm("Remove this note?")) return;
    try {
      await deleteDoc(doc(db, "feedback", id));
      setData((d) => d && { ...d, feedback: d.feedback.filter((f) => f.id !== id) });
    } catch (e) {
      handleActionError(e);
    }
  }

  async function adminSetMuted(u: U, muted: boolean) {
    if (
      !confirm(
        muted
          ? `Mute ${u.username}? They can still browse and like, but can't post or comment (enforced server-side) until unmuted.`
          : `Unmute ${u.username}? They can post and comment again.`
      )
    )
      return;
    try {
      await setDoc(doc(db, "users", u.email), { muted }, { merge: true });
      setData(
        (d) =>
          d && { ...d, users: d.users.map((x) => (x.email === u.email ? { ...x, muted } : x)) }
      );
      log(muted ? "mute-user" : "unmute-user", `${u.username} (${u.email})`);
    } catch (e) {
      handleActionError(e);
    }
  }

  // Approve claims: credit each claimant as their post's owner — the same
  // reassignment the feed's assign flow performs — then clear every pending
  // claim on those posts, since ownership is now settled (competing claims
  // for the same post are resolved together). At most one claimant per post.
  async function approveClaims(claims: Claim[]) {
    if (!data || !claims.length) return;
    const existingPosts = new Set(data.photos.map((p) => p.id));
    const byPost = new Map<string, Claim>();
    for (const c of claims) if (c.uid && !byPost.has(c.postId)) byPost.set(c.postId, c);
    if (!byPost.size) return;
    try {
      // Only reassign posts that still exist — a claim on a hard-deleted post
      // just clears (a merge-write would otherwise try to recreate the doc).
      for (const c of byPost.values()) {
        if (!existingPosts.has(c.postId)) continue;
        await setDoc(
          doc(db, "photos", c.postId),
          { userUUID: c.uid, username: c.username },
          { merge: true }
        );
      }
      const approvedPosts = new Set(byPost.keys());
      const resolved = data.claims.filter((c) => approvedPosts.has(c.postId));
      for (const c of resolved) await deleteDoc(doc(db, "claims", c.id));
      const resolvedIds = new Set(resolved.map((c) => c.id));
      setData(
        (d) =>
          d && {
            ...d,
            claims: d.claims.filter((c) => !resolvedIds.has(c.id)),
            photos: d.photos.map((p) => {
              const win = byPost.get(p.id);
              return win ? { ...p, userUUID: win.uid, username: win.username } : p;
            }),
          }
      );
      for (const c of byPost.values())
        log("approve-claim", `${c.username} (${c.email}) → ${c.postId}`);
    } catch (e) {
      handleActionError(e);
    }
  }

  // Decline claims: drop the requests. The posts stay Anonymous, untouched.
  async function declineClaims(claims: Claim[]) {
    if (!data || !claims.length) return;
    try {
      for (const c of claims) await deleteDoc(doc(db, "claims", c.id));
      const ids = new Set(claims.map((c) => c.id));
      setData((d) => d && { ...d, claims: d.claims.filter((c) => !ids.has(c.id)) });
      for (const c of claims) log("decline-claim", `${c.username} (${c.email}) ✗ ${c.postId}`);
    } catch (e) {
      handleActionError(e);
    }
  }

  async function sweepDeadDocs() {
    if (!m || !m.dead.length) return;
    if (
      !confirm(
        `Delete all ${m.dead.length} dead photo docs? These have no timestamp or image path and never render in the feed. This can't be undone.`
      ) ||
      !confirm("Really sure? This permanently deletes them.")
    )
      return;
    try {
      for (const p of m.dead) await deleteDoc(doc(db, "photos", p.id));
      setData((d) => d && { ...d, photos: d.photos.filter((p) => p.timestamp && p.imagePath) });
      log("sweep-dead-docs", `${m.dead.length} docs`);
    } catch (e) {
      handleActionError(e);
    }
  }

  async function sweepOrphanComments() {
    if (!m || !m.orphanComments.length) return;
    if (
      !confirm(
        `Delete ${m.orphanComments.length} orphaned comments? Their parent posts are already gone — these can never be seen in the app.`
      )
    )
      return;
    try {
      for (const c of m.orphanComments)
        await deleteDoc(doc(db, "photos", c.postId, "comments", c.id));
      const ids = new Set(m.orphanComments.map((c) => c.id));
      setData((d) => d && { ...d, comments: d.comments.filter((c) => !ids.has(c.id)) });
      log("sweep-orphan-comments", `${m.orphanComments.length} comments`);
    } catch (e) {
      handleActionError(e);
    }
  }

  async function saveAnnouncement(text: string, link: string, active: boolean) {
    try {
      await setDoc(doc(db, "config", "announcement"), {
        text,
        link,
        active,
        updatedAt: serverTimestamp(),
      });
      setData(
        (d) => d && { ...d, announcement: { text, link, active, updatedAt: new Date() } }
      );
      log(active ? "publish-announcement" : "takedown-announcement", text.slice(0, 100));
    } catch (e) {
      handleActionError(e);
      throw e;
    }
  }

  /* --------------------------------- exports --------------------------------- */

  function exportJson() {
    if (!data) return;
    downloadBlob(
      `nopostnow-export-${new Date().toISOString().slice(0, 10)}.json`,
      "application/json",
      JSON.stringify(data, null, 2)
    );
  }

  function exportPostsCsv() {
    if (!m) return;
    const rows = [
      ["id", "username", "caption", "timestamp", "likes", "comments", "width", "height"],
      ...m.live.map((p) => [
        p.id,
        p.username || "Anonymous",
        p.caption || "",
        p.timestamp?.toISOString() ?? "",
        p.likedBy.length,
        m.commentsByPost.get(p.id) ?? 0,
        p.imageWidth ?? "",
        p.imageHeight ?? "",
      ]),
    ];
    downloadBlob(
      `nopostnow-posts-${new Date().toISOString().slice(0, 10)}.csv`,
      "text/csv",
      rows.map((r) => r.map(csvCell).join(",")).join("\n")
    );
  }

  function exportMembersCsv() {
    if (!data || !m) return;
    const rows = [
      ["email", "username", "joined", "last_active", "posts", "comments", "likes_received", "muted"],
      ...data.users.map((u) => {
        const posts = m.live.filter((p) => p.username === u.username);
        return [
          u.email,
          u.username,
          u.joinedAt?.toISOString() ?? "",
          m.lastActive.get(u.username)?.toISOString() ?? "",
          posts.length,
          data.comments.filter((c) => c.username === u.username).length,
          posts.reduce((n, p) => n + p.likedBy.length, 0),
          u.muted ? "yes" : "no",
        ];
      }),
    ];
    downloadBlob(
      `nopostnow-members-${new Date().toISOString().slice(0, 10)}.csv`,
      "text/csv",
      rows.map((r) => r.map(csvCell).join(",")).join("\n")
    );
  }

  /* --------------------------------- render ---------------------------------- */

  if (loading || !user) {
    return (
      <div className="fixed inset-0 flex items-center justify-center text-sm font-semibold uppercase tracking-[2px] text-mut">
        Loading
      </div>
    );
  }

  // Rules enforce this server-side; non-admins just get an empty page.
  if (!isAdmin) {
    return (
      <div className="fixed inset-0 flex items-center justify-center text-sm text-mut">
        Nothing here.
      </div>
    );
  }

  if (!unlocked && mfaResolver) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <form onSubmit={unlockTotp} className="w-full max-w-[340px]">
          <h1 className="text-center text-lg font-extrabold">Admin</h1>
          <p className="mb-6 mt-1 text-center text-xs leading-relaxed text-mut">
            Enter the 6-digit code from your authenticator app.
          </p>
          {gateError && (
            <p className="mb-3 rounded-lg border-[0.5px] border-[#5c1a1a] bg-[#1a0a0a] px-3.5 py-3 text-[13px] text-[#e74c3c]">
              {gateError}
            </p>
          )}
          <input
            type="text"
            autoFocus
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="w-full rounded-lg border-[0.5px] border-edge bg-card px-3.5 py-3 text-center text-xl tracking-[8px] outline-none transition-colors placeholder:text-[#2e2e2e] focus:border-mut"
          />
          <button
            type="submit"
            disabled={gateBusy || totpCode.length !== 6}
            className="mt-3 w-full rounded-lg bg-white p-3 text-sm font-extrabold text-black transition-opacity disabled:opacity-30"
          >
            Verify
          </button>
        </form>
      </main>
    );
  }

  if (!unlocked) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <form onSubmit={unlock} className="w-full max-w-[340px]">
          <h1 className="text-center text-lg font-extrabold">Admin</h1>
          <p className="mb-6 mt-1 text-center text-xs leading-relaxed text-mut">
            Re-enter your password. Admin actions are only valid for 15 minutes after this
            check — enforced server-side.
          </p>
          {gateError && (
            <p className="mb-3 rounded-lg border-[0.5px] border-[#5c1a1a] bg-[#1a0a0a] px-3.5 py-3 text-[13px] text-[#e74c3c]">
              {gateError}
            </p>
          )}
          <input
            type="password"
            autoFocus
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border-[0.5px] border-edge bg-card px-3.5 py-3 text-[16px] outline-none transition-colors placeholder:text-[#2e2e2e] focus:border-mut"
          />
          <button
            type="submit"
            disabled={gateBusy || !password}
            className="mt-3 w-full rounded-lg bg-white p-3 text-sm font-extrabold text-black transition-opacity disabled:opacity-30"
          >
            Unlock
          </button>
        </form>
      </main>
    );
  }

  if (loadError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-6 text-center text-sm text-[#e74c3c]">
        {loadError}
      </div>
    );
  }

  if (!data || !m) {
    return (
      <div className="fixed inset-0 flex items-center justify-center text-sm font-semibold uppercase tracking-[2px] text-mut">
        Crunching numbers…
      </div>
    );
  }

  const filteredPosts = m.live.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (p.username || "anonymous").toLowerCase().includes(q) ||
      (p.caption || "").toLowerCase().includes(q)
    );
  });
  const sortedPosts = [...filteredPosts].sort((a, b) =>
    sort === "liked"
      ? b.likedBy.length - a.likedBy.length
      : sort === "commented"
        ? (m.commentsByPost.get(b.id) ?? 0) - (m.commentsByPost.get(a.id) ?? 0)
        : 0
  );
  const pagePosts = sortedPosts.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const filteredComments = [...data.comments]
    .sort((a, b) => (b.timestamp?.getTime() ?? 0) - (a.timestamp?.getTime() ?? 0))
    .filter((c) => {
      const q = cSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        (c.username || "").toLowerCase().includes(q) || c.text.toLowerCase().includes(q)
      );
    });
  const pageComments = filteredComments.slice(cPage * C_PER_PAGE, (cPage + 1) * C_PER_PAGE);

  const subsByUid = new Map<string, S[]>();
  for (const s of data.subs) {
    const k = s.uid ?? "unknown";
    subsByUid.set(k, [...(subsByUid.get(k) ?? []), s]);
  }

  const photoById = new Map(data.photos.map((p) => [p.id, p] as const));

  const engagement = m.live.length
    ? ((m.totalLikes + data.comments.length) / m.live.length).toFixed(1)
    : "—";

  const healthIssues = m.dead.length + m.orphanComments.length;
  const TABS: { id: TabId; label: string; badge?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "approvals", label: "Approvals", badge: data.claims.length || undefined },
    { id: "analytics", label: "Analytics" },
    { id: "leaderboards", label: "Leaderboards" },
    { id: "members", label: "Members", badge: data.feedback.length || undefined },
    { id: "moderation", label: "Moderation" },
    { id: "broadcast", label: "Broadcast" },
    { id: "system", label: "System", badge: healthIssues || undefined },
  ];

  return (
    <>
      <TopNav />
      <main className="mx-auto w-full max-w-2xl pb-24 pt-[calc(52px+env(safe-area-inset-top))]">
        {enrolledBump >= 0 && multiFactor(user).enrolledFactors.length === 0 && (
          <TotpEnrollCard
            user={user}
            onEnrolled={() => {
              setEnrolledBump((b) => b + 1);
              lock("2FA enabled. Unlock again — from now on you'll need your password and a code.");
            }}
          />
        )}

        <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-6">
          <div>
            <h1 className="text-2xl font-extrabold tracking-[-0.4px]">Admin</h1>
            <p className="mt-0.5 text-[11px] text-mut">
              {m.live.length} posts · {data.users.length} members · {data.subs.length} devices
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportJson} className={btn}>
              JSON
            </button>
            <button onClick={exportPostsCsv} className={btn}>
              Posts CSV
            </button>
            <button onClick={exportMembersCsv} className={btn}>
              Members CSV
            </button>
          </div>
        </div>

        <TabBar tabs={TABS} active={tab} onChange={setTab} />

        <div className="flex flex-col gap-3 px-3 py-4">
          {tab === "overview" && (
            <Section title="Growth — cumulative posts" desc="Every post ever shared, added up month by month.">
              <AreaChart data={m.postsGrowth} tone="255,59,92" />
            </Section>
          )}

          {tab === "approvals" && (
            <Section
              title={`Post claims (${data.claims.length})`}
              desc="Members asking to be credited as the owner of an Anonymous post. Approving reassigns the post to them; declining leaves it Anonymous."
            >
              {data.claims.length === 0 ? (
                <p className="text-xs text-dim">
                  No pending claims. Members can claim Anonymous posts from the feed.
                </p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() =>
                        setSelectedClaims((s) =>
                          data.claims.every((c) => s.has(c.id))
                            ? new Set()
                            : new Set(data.claims.map((c) => c.id))
                        )
                      }
                      className={btn}
                    >
                      {data.claims.every((c) => selectedClaims.has(c.id))
                        ? "Unselect all"
                        : "Select all"}
                    </button>
                    {selectedClaims.size > 0 && (
                      <>
                        <button
                          onClick={() => {
                            const sel = data.claims.filter((c) => selectedClaims.has(c.id));
                            if (
                              !confirm(
                                `Approve ${sel.length} claim${sel.length === 1 ? "" : "s"} and credit each claimant as the post owner?`
                              )
                            )
                              return;
                            approveClaims(sel);
                            setSelectedClaims(new Set());
                          }}
                          className={btnPrimary}
                        >
                          Approve {selectedClaims.size} selected
                        </button>
                        <button
                          onClick={() => {
                            const sel = data.claims.filter((c) => selectedClaims.has(c.id));
                            if (!confirm(`Decline ${sel.length} claim${sel.length === 1 ? "" : "s"}?`))
                              return;
                            declineClaims(sel);
                            setSelectedClaims(new Set());
                          }}
                          className={btnDanger}
                        >
                          Decline {selectedClaims.size} selected
                        </button>
                        <button onClick={() => setSelectedClaims(new Set())} className={btn}>
                          Clear
                        </button>
                      </>
                    )}
                    <span className="ml-auto flex gap-2">
                      <button
                        onClick={() => {
                          if (!confirm(`Approve ALL ${data.claims.length} pending claims?`)) return;
                          approveClaims(data.claims);
                          setSelectedClaims(new Set());
                        }}
                        className={btn}
                      >
                        Approve all
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm(`Decline ALL ${data.claims.length} pending claims?`)) return;
                          declineClaims(data.claims);
                          setSelectedClaims(new Set());
                        }}
                        className={btnDanger}
                      >
                        Decline all
                      </button>
                    </span>
                  </div>
                  <div className="flex flex-col">
                    {data.claims.map((c) => {
                      const post = photoById.get(c.postId);
                      const dupes = data.claims.filter((x) => x.postId === c.postId).length;
                      return (
                        <div
                          key={c.id}
                          className="flex items-center gap-3 border-t-[0.5px] border-field py-2.5"
                        >
                          <input
                            type="checkbox"
                            checked={selectedClaims.has(c.id)}
                            onChange={(e) =>
                              setSelectedClaims((s) => {
                                const next = new Set(s);
                                if (e.target.checked) next.add(c.id);
                                else next.delete(c.id);
                                return next;
                              })
                            }
                            className="h-4 w-4 shrink-0 accent-white"
                          />
                          {post?.imagePath ? (
                            <Thumb path={post.imagePath} />
                          ) : (
                            <div className="h-11 w-11 shrink-0 rounded bg-field" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs">
                              <span className="font-bold">{c.username}</span>{" "}
                              <span className="text-dim">({c.email})</span>
                            </p>
                            <p className="truncate text-[10px] text-dim">
                              claims{" "}
                              {post
                                ? post.caption
                                  ? `“${post.caption.slice(0, 40)}”`
                                  : "a post"
                                : "a deleted post"}{" "}
                              · {fmtDateTime(c.at)}
                              {dupes > 1 && (
                                <span className="text-[#d4a017]"> · {dupes} people claim this</span>
                              )}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              if (!confirm(`Approve — credit ${c.username} as the owner of this post?`))
                                return;
                              approveClaims([c]);
                              setSelectedClaims((s) => {
                                const n = new Set(s);
                                n.delete(c.id);
                                return n;
                              });
                            }}
                            className={btn}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              if (!confirm(`Decline ${c.username}'s claim?`)) return;
                              declineClaims([c]);
                              setSelectedClaims((s) => {
                                const n = new Set(s);
                                n.delete(c.id);
                                return n;
                              });
                            }}
                            className={btnDanger}
                          >
                            Decline
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </Section>
          )}

          {tab === "system" && (
            <SecurityPanel user={user} unlockedAt={unlockedAt} onLock={lock} />
          )}

          {tab === "broadcast" && (
            <BroadcastComposer
              user={user}
              deviceCount={data.subs.length}
              onSent={(message, result, test) => {
                if (!test) log("broadcast-push", `“${message.slice(0, 100)}” — ${result}`);
              }}
            />
          )}

          {tab === "broadcast" && (
            <AnnouncementManager
              key={data.announcement?.updatedAt?.getTime() ?? "none"}
              initial={data.announcement}
              onSave={saveAnnouncement}
            />
          )}

          {tab === "members" && (
            <Section title={`Member feedback (${data.feedback.length})`}>
              <div className="flex flex-col">
                {data.feedback.map((f) => (
                  <div key={f.id} className="flex items-start gap-3 border-t-[0.5px] border-field py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs">
                        <span className="font-bold">{f.username}</span>{" "}
                        <span className="text-dim">({f.email})</span>
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-body">{f.text}</p>
                      <p className="mt-1 text-[10px] text-dim">{fmtDateTime(f.at)}</p>
                    </div>
                    <button onClick={() => adminDeleteFeedback(f.id)} className={btnDanger}>
                      Remove
                    </button>
                  </div>
                ))}
                {data.feedback.length === 0 && (
                  <p className="text-xs text-dim">
                    Nothing yet — notes members send from Settings land here.
                  </p>
                )}
              </div>
            </Section>
          )}

          {tab === "overview" && (
            <Section title="Key metrics">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Stat label="Posts" value={m.live.length} sub={`${m.posts7} this week · ${m.posts30} this month`} />
            <Stat label="Comments" value={data.comments.length} sub={`${m.comments30} this month`} />
            <Stat label="Likes" value={m.totalLikes} sub={`${(m.totalLikes / Math.max(m.live.length, 1)).toFixed(1)} avg per post`} />
            <Stat label="Members" value={data.users.length} sub={`${m.activeSince30} active last 30 days`} />
            <Stat label="Engagement" value={engagement} sub="likes + comments per post" />
            <Stat label="Lurkers" value={m.lurkers.length} sub="members with 0 posts & comments" />
            <Stat
              label="Site streak"
              value={m.siteStreaks.current ? `${m.siteStreaks.current}d` : "0"}
              sub={`best ever: ${m.siteStreaks.longest} days straight`}
              tone={m.siteStreaks.current ? "green" : undefined}
            />
            <Stat
              label="Last post"
              value={
                m.daysSinceLastPost === null
                  ? "—"
                  : m.daysSinceLastPost === 0
                    ? "Today"
                    : `${m.daysSinceLastPost}d ago`
              }
              sub={fmtDate(m.live[0]?.timestamp ?? null)}
              tone={m.daysSinceLastPost !== null && m.daysSinceLastPost > 2 ? "gold" : undefined}
            />
            <Stat label="Push devices" value={data.subs.length} sub={`${subsByUid.size} member${subsByUid.size === 1 ? "" : "s"} enabled`} />
            <Stat label="Legacy visitors" value={data.legacy.length} sub="unique devices, PHP era" />
            <Stat label="Captioned" value={pct(m.captioned.length, m.live.length)} sub={`avg ${Math.round(m.captioned.reduce((n, p) => n + (p.caption?.length ?? 0), 0) / Math.max(m.captioned.length, 1))} chars`} />
            <Stat label="Comments / post" value={(data.comments.length / Math.max(m.live.length, 1)).toFixed(1)} />
            <Stat
              label="Busiest day"
              value={m.perDay[0]?.[1] ?? 0}
              sub={m.perDay[0] ? `posts on ${fmtDate(new Date(m.perDay[0][0]))}` : undefined}
            />
            <Stat label="First post" value={fmtDate(m.live.at(-1)?.timestamp ?? null)} />
            <Stat label="Anonymous era" value={m.anonPosts} sub="posts without an account" />
            <Stat
              label="Orientation"
              value={m.withDims ? `${Math.round((m.aspect.portrait / m.withDims) * 100)}%` : "—"}
              sub={`portrait · ${m.aspect.landscape} landscape, ${m.aspect.square} square`}
            />
              </div>
            </Section>
          )}

          {tab === "overview" && (
            <Section title="Activity heatmap — last 6 months (posts + comments)">
              <Heatmap counts={m.heatCounts} />
            </Section>
          )}

          {tab === "analytics" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Section title="Posts per month">
                <BarChart data={m.postsMonthly} />
              </Section>
              <Section title="All-time posts (cumulative)">
                <AreaChart data={m.postsGrowth} />
              </Section>
              <Section title="Comments per month">
                <BarChart data={m.commentsMonthly} />
              </Section>
              <Section title="Active members per month">
                <BarChart data={m.activeMonthly} />
              </Section>
              <Section title="Posting activity — hour of day">
                <BarChart data={m.hourHist} />
              </Section>
              <Section title="Posting activity — day of week">
                <BarChart data={m.weekdayHist} />
              </Section>
              <Section title="Legacy visitor growth (PHP era, cumulative)">
                <AreaChart data={m.legacyGrowth} />
              </Section>
              <Section title="Image orientation" desc="Aspect ratio of posts with known dimensions.">
                <StackBar
                  segments={[
                    { label: "Portrait", v: m.aspect.portrait },
                    { label: "Landscape", v: m.aspect.landscape },
                    { label: "Square", v: m.aspect.square },
                  ]}
                />
              </Section>
            </div>
          )}

          {tab === "analytics" && (
            <Section title="Content analytics">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Board title="Top words (captions + comments)" rows={m.words} />
            <div className="flex flex-col gap-2.5">
              <Board title="Top emoji" rows={m.emoji} />
              <div className="rounded-lg border-[0.5px] border-field bg-card p-3.5">
                <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[1.5px] text-mut">
                  Writing habits
                </p>
                <div className="flex flex-col gap-1.5 text-[13px]">
                  <p className="flex justify-between"><span>Avg comment length</span><span className="font-bold tabular-nums">{m.avgCommentLen} chars</span></p>
                  <p className="flex justify-between"><span>Posts with captions</span><span className="font-bold tabular-nums">{pct(m.captioned.length, m.live.length)}</span></p>
                  <p className="flex justify-between"><span>Posts before 6 AM</span><span className="font-bold tabular-nums">{m.live.filter((p) => p.timestamp!.getHours() < 6).length}</span></p>
                </div>
              </div>
            </div>
          </div>
            </Section>
          )}

          {tab === "leaderboards" && (
            <Section title="Leaderboards">
              <div className="grid gap-2.5 sm:grid-cols-2">
            <Board title="Top posters" rows={m.topPosters} />
            <Board title="Top commenters" rows={m.topCommenters} />
            <Board title="Most likes given" rows={m.likesGiven} />
            <Board title="Most likes received" rows={m.likesReceived} />
            <Board title="Longest posting streaks" rows={m.userStreaks} />
            <Board title="Night owls (posts before 6 AM)" rows={m.nightOwls} />
            <Board
              title="Most liked posts"
              rows={m.topLiked.map((p) => [
                `${p.username || "Anonymous"}${p.caption ? ` — “${p.caption.slice(0, 32)}”` : ""}`,
                `♥ ${p.likedBy.length}`,
              ])}
            />
            <Board
              title="Most commented posts"
              rows={m.topCommented.map((p) => [
                `${p.username || "Anonymous"}${p.caption ? ` — “${p.caption.slice(0, 32)}”` : ""}`,
                `💬 ${m.commentsByPost.get(p.id) ?? 0}`,
              ])}
            />
          </div>
            </Section>
          )}

          {tab === "members" && (
            <Section title={`Members (${data.users.length})`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-xs">
              <thead>
                <tr className="text-[9px] font-bold uppercase tracking-[1.2px] text-dim">
                  <th className="pb-2 pr-3">User</th>
                  <th className="pb-2 pr-3">Joined</th>
                  <th className="pb-2 pr-3">Last active</th>
                  <th className="pb-2 pr-3 text-right">Posts</th>
                  <th className="pb-2 pr-3 text-right">Comments</th>
                  <th className="pb-2 pr-3 text-right">♥ Recv</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => {
                  const posts = m.live.filter((p) => p.username === u.username);
                  const open = openMember === u.email;
                  return (
                    <Fragment key={u.email}>
                      <tr className="border-t-[0.5px] border-field">
                        <td className="py-2 pr-3">
                          {u.uid ? (
                            <Link href={`/u/${u.uid}`} className="font-bold">
                              {u.username}
                            </Link>
                          ) : (
                            <span className="font-bold">{u.username}</span>
                          )}
                          {u.muted && (
                            <span className="ml-1.5 rounded bg-[#1a0a0a] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[1px] text-[#e74c3c]">
                              Muted
                            </span>
                          )}
                          <span className="block text-[10px] text-dim">{u.email}</span>
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap text-mut">{fmtDate(u.joinedAt)}</td>
                        <td className="py-2 pr-3 whitespace-nowrap text-mut">
                          {fmtDate(m.lastActive.get(u.username) ?? null)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{posts.length}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {data.comments.filter((c) => c.username === u.username).length}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {posts.reduce((n, p) => n + p.likedBy.length, 0)}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => setOpenMember(open ? null : u.email)}
                              className={btn}
                            >
                              {open ? "Close" : "Details"}
                            </button>
                            <button onClick={() => adminRename(u)} className={btn}>
                              Rename
                            </button>
                            <button
                              onClick={() => adminSetMuted(u, !u.muted)}
                              className={u.muted ? btn : btnDanger}
                            >
                              {u.muted ? "Unmute" : "Mute"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={7} className="pb-3 pt-1">
                            <MemberDetail
                              u={u}
                              data={data}
                              live={m.live}
                              onDeletePost={adminDeletePost}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-dim">
            “Joined” self-heals when each member next opens the app. Muting is enforced by
            security rules — a muted member physically can&apos;t write posts or comments.
            Deleting a member&apos;s login requires the Firebase console (Authentication → Users).
          </p>
            </Section>
          )}

          {tab === "moderation" && (
            <>
              <Section title={`Posts (${m.live.length})`}>
          <div className="mb-3 flex gap-2">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Search caption or user…"
              className={`min-w-0 flex-1 ${inputCls}`}
            />
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as typeof sort);
                setPage(0);
              }}
              className="rounded-lg border-[0.5px] border-edge bg-card px-2 py-2 text-xs outline-none"
            >
              <option value="new">Newest</option>
              <option value="liked">Most liked</option>
              <option value="commented">Most commented</option>
            </select>
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() =>
                setSelected((s) => {
                  const next = new Set(s);
                  const allSelected = pagePosts.every((p) => next.has(p.id));
                  for (const p of pagePosts) {
                    if (allSelected) next.delete(p.id);
                    else next.add(p.id);
                  }
                  return next;
                })
              }
              className={btn}
            >
              {pagePosts.every((p) => selected.has(p.id)) && pagePosts.length
                ? "Unselect page"
                : "Select page"}
            </button>
            {selected.size > 0 && (
              <>
                <button onClick={bulkDeletePosts} className={btnDanger}>
                  Delete {selected.size} selected
                </button>
                <button onClick={() => setSelected(new Set())} className={btn}>
                  Clear
                </button>
              </>
            )}
          </div>

          <div className="flex flex-col">
            {pagePosts.map((p) => (
              <div key={p.id} className="flex items-center gap-3 border-t-[0.5px] border-field py-2.5">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={(e) =>
                    setSelected((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      return next;
                    })
                  }
                  className="h-4 w-4 shrink-0 accent-white"
                />
                {p.imagePath && <Thumb path={p.imagePath} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">
                    <span className="font-bold">{p.username || "Anonymous"}</span>
                    {p.caption && <span className="text-mut"> — {p.caption}</span>}
                  </p>
                  <p className="text-[10px] text-dim">
                    {fmtDateTime(p.timestamp)} · ♥ {p.likedBy.length} · 💬{" "}
                    {m.commentsByPost.get(p.id) ?? 0}
                    {!p.imageWidth && " · no dims"}
                  </p>
                </div>
                <button onClick={() => adminDeletePost(p)} className={btnDanger}>
                  Delete
                </button>
              </div>
            ))}
          </div>

          {sortedPosts.length > PER_PAGE && (
            <div className="mt-3 flex items-center justify-between text-xs text-mut">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className={btn}>
                Prev
              </button>
              <span className="tabular-nums">
                {page + 1} / {Math.ceil(sortedPosts.length / PER_PAGE)}
              </span>
              <button
                disabled={(page + 1) * PER_PAGE >= sortedPosts.length}
                onClick={() => setPage((p) => p + 1)}
                className={btn}
              >
                Next
              </button>
            </div>
          )}
        </Section>

        <Section title={`Deleted posts (${m.trashed.length})`}>
          <p className="mb-3 text-[11px] leading-relaxed text-dim">
            Posts members removed from Settings (or an admin archived). Hidden
            everywhere in the app but never destroyed — recover puts one back
            in the feed exactly as it was; Delete forever actually erases it.
          </p>
          <div className="flex flex-col">
            {m.trashed.map((p) => (
              <div key={p.id} className="flex items-center gap-3 border-t-[0.5px] border-field py-2.5">
                {p.imagePath && <Thumb path={p.imagePath} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">
                    <span className="font-bold">{p.username || "Anonymous"}</span>
                    {p.caption && <span className="text-mut"> — {p.caption}</span>}
                  </p>
                  <p className="text-[10px] text-dim">
                    posted {fmtDateTime(p.timestamp)} · deleted {fmtDateTime(p.deletedAt ?? null)} · ♥ {p.likedBy.length}
                  </p>
                </div>
                <button onClick={() => adminRecoverPost(p)} className={btn}>
                  Recover
                </button>
                <button onClick={() => adminDeletePost(p)} className={btnDanger}>
                  Delete forever
                </button>
              </div>
            ))}
            {m.trashed.length === 0 && <p className="text-xs text-dim">Trash is empty.</p>}
          </div>
        </Section>

        <Section title={`Comments (${data.comments.length})`}>
          <input
            value={cSearch}
            onChange={(e) => {
              setCSearch(e.target.value);
              setCPage(0);
            }}
            placeholder="Search comment text or user…"
            className={`mb-3 w-full ${inputCls}`}
          />
          <div className="flex flex-col">
            {pageComments.map((c) => (
              <div key={`${c.postId}-${c.id}`} className="flex items-center gap-3 border-t-[0.5px] border-field py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">
                    <span className="font-bold">{c.username}</span>{" "}
                    <span className="text-mut">{c.text}</span>
                  </p>
                  <p className="text-[10px] text-dim">{fmtDateTime(c.timestamp)}</p>
                </div>
                <button onClick={() => adminDeleteComment(c)} className={btnDanger}>
                  Delete
                </button>
              </div>
            ))}
            {pageComments.length === 0 && <p className="text-xs text-dim">No matches.</p>}
          </div>
          {filteredComments.length > C_PER_PAGE && (
            <div className="mt-3 flex items-center justify-between text-xs text-mut">
              <button disabled={cPage === 0} onClick={() => setCPage((p) => p - 1)} className={btn}>
                Prev
              </button>
              <span className="tabular-nums">
                {cPage + 1} / {Math.ceil(filteredComments.length / C_PER_PAGE)}
              </span>
              <button
                disabled={(cPage + 1) * C_PER_PAGE >= filteredComments.length}
                onClick={() => setCPage((p) => p + 1)}
                className={btn}
              >
                Next
              </button>
            </div>
          )}
              </Section>
            </>
          )}

          {tab === "system" && (
            <>
              <Section title={`Push devices (${data.subs.length})`}>
          <div className="flex flex-col">
            {[...subsByUid.entries()].map(([uid, subs]) =>
              subs.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 border-t-[0.5px] border-field py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold">
                      {m.nameOf(uid === "unknown" ? null : uid)}
                      <span className="ml-1.5 font-normal text-dim">device {i + 1}</span>
                    </p>
                    <p className="truncate text-[10px] text-dim">
                      {new URL(s.endpoint).hostname} · updated {fmtDate(s.updatedAt)}
                    </p>
                  </div>
                  <button onClick={() => adminDeleteSub(s)} className={btnDanger}>
                    Remove
                  </button>
                </div>
              ))
            )}
            {data.subs.length === 0 && <p className="text-xs text-dim">No devices enabled yet.</p>}
          </div>
        </Section>

        <Section title="Data health">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Stat label="Dead photo docs" value={m.dead.length} sub="no timestamp/image — never render" />
            <Stat label="Orphaned comments" value={m.orphanComments.length} sub="parent post deleted" />
            <Stat label="Posts w/o dims" value={m.noDims} sub="feed can't reserve space" />
            <Stat label="Ghost likes" value={m.ghostLikes} sub="from uids with no known name" />
            <Stat label="Total photo docs" value={data.photos.length} />
            <Stat label="Total comment docs" value={data.comments.length} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {m.dead.length > 0 && (
              <button onClick={sweepDeadDocs} className={btnDanger}>
                Delete all {m.dead.length} dead docs
              </button>
            )}
            {m.orphanComments.length > 0 && (
              <button onClick={sweepOrphanComments} className={btnDanger}>
                Delete {m.orphanComments.length} orphaned comments
              </button>
            )}
          </div>
        </Section>

        <Section title={`Audit log (${data.log.length})`}>
          <div className="flex flex-col">
            {data.log.slice(0, 100).map((entry) => (
              <div key={entry.id} className="border-t-[0.5px] border-field py-2">
                <p className="text-xs">
                  <span className="font-bold">{entry.action}</span>{" "}
                  <span className="text-mut">{entry.detail}</span>
                </p>
                <p className="text-[10px] text-dim">{fmtDateTime(entry.at)}</p>
              </div>
            ))}
            {data.log.length === 0 && (
              <p className="text-xs text-dim">
                No admin actions recorded yet. Every delete, rename, mute, broadcast and
                announcement lands here — the log is append-only and can&apos;t be edited or
                cleared, even by you.
              </p>
            )}
          </div>
              </Section>

              <p className="px-1 pt-1 text-[10px] leading-relaxed text-dim">
                Access is enforced by Firebase custom claims and Firestore security rules, not
                just this page. Admin mutations (deletes, renames, mutes, announcements) are
                rejected server-side unless your password was re-entered in the last 15 minutes.
                Every admin action is written to an append-only audit log.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
