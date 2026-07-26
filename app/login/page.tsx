"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth } from "@/lib/firebase";

type Mode = "login" | "reset";

function friendlyError(err: unknown) {
  const code = err instanceof FirebaseError ? err.code : "";
  if (/invalid-credential|wrong-password|user-not-found/.test(code))
    return "Wrong email or password.";
  if (/email-already-in-use/.test(code))
    return "An account with that email already exists.";
  if (/weak-password/.test(code)) return "Password needs at least 6 characters.";
  if (/invalid-email/.test(code)) return "That doesn't look like an email address.";
  if (/too-many-requests/.test(code))
    return "Too many attempts — wait a minute and try again.";
  return err instanceof Error ? err.message : "Something went wrong.";
}

const label = "mb-1.5 block text-[10px] font-bold uppercase tracking-[1.5px] text-mut";
// 16px inputs — anything smaller makes iOS Safari zoom the page on focus.
const field =
  "w-full rounded-lg border-[0.5px] border-edge bg-card px-3.5 py-3 text-[16px] outline-none transition-colors placeholder:text-[#2e2e2e] focus:border-mut";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set when the account has 2FA enrolled: password was right, code still needed.
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [totpCode, setTotpCode] = useState("");

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const credential = await signInWithEmailAndPassword(auth, email, password);
        const token = await credential.user.getIdTokenResult(true);
        if (token.claims.member !== true) {
          await signOut(auth);
          throw new Error("This account has not been invited to this community.");
        }
        router.replace("/");
      } else {
        await sendPasswordResetEmail(auth, email);
        setInfo("Password reset email sent — check your inbox.");
      }
    } catch (err) {
      if (err instanceof FirebaseError && err.code === "auth/multi-factor-auth-required") {
        setMfaResolver(getMultiFactorResolver(auth, err as MultiFactorError));
      } else {
        setError(friendlyError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaResolver) return;
    setError(null);
    setBusy(true);
    try {
      const totpHint = mfaResolver.hints.find(
        (h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID
      );
      if (!totpHint) throw new Error("No authenticator enrolled on this account.");
      await mfaResolver.resolveSignIn(
        TotpMultiFactorGenerator.assertionForSignIn(totpHint.uid, totpCode.trim())
      );
      router.replace("/");
    } catch {
      setError("Wrong code — check your authenticator app and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (mfaResolver) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 py-6">
        <form onSubmit={handleTotp} className="w-full max-w-[380px]">
          <div className="mb-10 text-center">
            <h1 className="text-[32px] font-black leading-none tracking-[-1px]">NoPostNow</h1>
            <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[2.5px] text-dim">
              Two-factor authentication
            </p>
          </div>
          <p className="mb-6 text-center text-[13px] leading-relaxed text-mut">
            Enter the 6-digit code from your authenticator app.
          </p>
          {error && (
            <p className="mb-4 rounded-lg border-[0.5px] border-[#5c1a1a] bg-[#1a0a0a] px-3.5 py-3 text-[13px] leading-snug text-[#e74c3c]">
              {error}
            </p>
          )}
          <input
            autoFocus
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className={`${field} text-center text-xl tracking-[8px]`}
          />
          <button
            type="submit"
            disabled={busy || totpCode.length !== 6}
            className="mt-3 w-full rounded-lg bg-white p-3.5 text-sm font-extrabold tracking-[0.3px] text-black transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            Verify
          </button>
          <button
            type="button"
            onClick={() => {
              setMfaResolver(null);
              setTotpCode("");
              setError(null);
            }}
            className="mt-4 w-full text-center text-xs text-dim transition-colors hover:text-white"
          >
            Back to log in
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-6">
      <div className="w-full max-w-[380px]">
        <div className="mb-12 text-center">
          <h1 className="text-[32px] font-black leading-none tracking-[-1px]">NoPostNow</h1>
          <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[2.5px] text-dim">
            Private photo feed
          </p>
        </div>

        {mode === "reset" && (
          <p className="mb-8 text-center text-[13px] leading-relaxed text-mut">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        )}

        {error && (
          <p className="mb-4 rounded-lg border-[0.5px] border-[#5c1a1a] bg-[#1a0a0a] px-3.5 py-3 text-[13px] leading-snug text-[#e74c3c]">
            {error}
          </p>
        )}
        {info && (
          <p className="mb-4 rounded-lg border-[0.5px] border-[#1a5c2e] bg-[#0a1a0f] px-3.5 py-3 text-[13px] leading-snug text-[#2ecc71]">
            {info}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className={label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
          </div>

          {mode !== "reset" && (
            <div className="mb-4">
              <label className={label} htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={field}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-2.5 w-full rounded-lg bg-white p-3.5 text-sm font-extrabold tracking-[0.3px] text-black transition-opacity hover:opacity-90 active:opacity-75 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {mode === "login" ? "Log In" : "Send Reset Link"}
          </button>
        </form>

        <div className="mt-5 text-center text-xs leading-relaxed text-dim">
          {mode === "reset" ? (
            <button onClick={() => switchMode("login")} className="transition-colors hover:text-white">
              Back to log in
            </button>
          ) : (
            <button onClick={() => switchMode("reset")} className="transition-colors hover:text-white">
              Forgot password?
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
