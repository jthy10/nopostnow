"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  getMultiFactorResolver,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  TotpMultiFactorGenerator,
  updateProfile,
  validatePassword,
  type MultiFactorError,
  type MultiFactorResolver,
  type User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

type Mode = "login" | "signup" | "reset" | "verify";

function friendlyError(error: unknown) {
  const code = error instanceof FirebaseError ? error.code : "";
  if (/invalid-credential|wrong-password|user-not-found/.test(code)) {
    return "Wrong email or password.";
  }
  if (/email-already-in-use/.test(code)) {
    return "We couldn't create that account. Try logging in or resetting your password.";
  }
  if (/weak-password|password-does-not-meet-requirements/.test(code)) {
    return "Use at least 12 characters with uppercase, lowercase, and a number.";
  }
  if (/invalid-email/.test(code)) return "Enter a valid email address.";
  if (/too-many-requests|quota-exceeded/.test(code)) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  if (/network-request-failed/.test(code)) {
    return "We couldn't reach the login service. Check your connection and try again.";
  }
  if (/operation-not-allowed/.test(code)) {
    return "Email sign-in is temporarily unavailable.";
  }
  return "Something went wrong. Please try again.";
}

function usernameError(value: string) {
  const name = value.trim();
  if (name.length < 2) return "Display name must be at least 2 characters.";
  if (name.length > 24) return "Display name must be 24 characters or fewer.";
  if (name.toLowerCase() === "anonymous") return "That display name is reserved.";
  if (name.includes("_")) return "Display names can't contain underscores.";
  return null;
}

async function passwordError(value: string) {
  const status = await validatePassword(auth, value);
  if (status.isValid) return null;
  const missing: string[] = [];
  if (status.meetsMinPasswordLength === false) missing.push("12 characters");
  if (status.meetsMaxPasswordLength === false) missing.push("128 characters or fewer");
  if (status.containsUppercaseLetter === false) missing.push("an uppercase letter");
  if (status.containsLowercaseLetter === false) missing.push("a lowercase letter");
  if (status.containsNumericCharacter === false) missing.push("a number");
  if (status.containsNonAlphanumericCharacter === false) missing.push("a symbol");
  return missing.length
    ? `Password needs ${missing.join(", ")}.`
    : "Choose a stronger password.";
}

const label = "mb-1.5 block text-[10px] font-bold uppercase tracking-[1.5px] text-meta";
const field =
  "w-full rounded-xl border border-edge bg-card px-3.5 py-3.5 text-[16px] text-white outline-none transition-colors placeholder:text-dim focus:border-meta";
const primary =
  "w-full rounded-xl bg-white p-3.5 text-sm font-extrabold tracking-[0.3px] text-black transition-opacity hover:opacity-90 active:opacity-75 disabled:cursor-not-allowed disabled:opacity-40";

function authActionSettings() {
  return { url: `${window.location.origin}/login` };
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, pendingUser, loading } = useAuth();
  const [selectedMode, setMode] = useState<Mode | null>(null);
  const mode: Mode =
    pendingUser
      ? "verify"
      : selectedMode ??
        (searchParams.get("mode") === "signup" ? "signup" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
  const [totpCode, setTotpCode] = useState("");

  useEffect(() => {
    if (loading) return;
    if (user) {
      router.replace("/feed");
    }
  }, [loading, router, user]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
    setPassword("");
    setConfirmPassword("");
  }

  async function finishLogin(account: User) {
    if (!account.emailVerified) {
      setEmail(account.email ?? email);
      setMode("verify");
      setInfo("Verify your email before entering the feed.");
      return;
    }
    await account.getIdToken(true);
    router.replace("/feed");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);

    const normalizedEmail = email.trim().toLowerCase();
    try {
      if (mode === "login") {
        const credential = await signInWithEmailAndPassword(
          auth,
          normalizedEmail,
          password
        );
        await finishLogin(credential.user);
      } else if (mode === "signup") {
        const invalidName = usernameError(name);
        if (invalidName) throw new Error(invalidName);
        if (password !== confirmPassword) {
          throw new Error("Passwords don't match.");
        }
        const invalidPassword = await passwordError(password);
        if (invalidPassword) throw new Error(invalidPassword);

        const credential = await createUserWithEmailAndPassword(
          auth,
          normalizedEmail,
          password
        );
        await updateProfile(credential.user, { displayName: name.trim() });
        setEmail(normalizedEmail);
        setMode("verify");
        await sendEmailVerification(credential.user, authActionSettings());
        setInfo(`We sent a verification link to ${normalizedEmail}.`);
      } else if (mode === "reset") {
        await sendPasswordResetEmail(auth, normalizedEmail, authActionSettings());
        setInfo(
          "If an account exists for that email, a password reset link is on its way."
        );
      }
    } catch (error) {
      if (
        error instanceof FirebaseError &&
        error.code === "auth/multi-factor-auth-required"
      ) {
        setMfaResolver(getMultiFactorResolver(auth, error as MultiFactorError));
      } else if (error instanceof Error && !(error instanceof FirebaseError)) {
        setError(error.message);
      } else {
        setError(friendlyError(error));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleTotp(event: React.FormEvent) {
    event.preventDefault();
    if (!mfaResolver) return;
    setError(null);
    setBusy(true);
    try {
      const totpHint = mfaResolver.hints.find(
        (hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID
      );
      if (!totpHint) throw new Error("No authenticator is enrolled on this account.");
      const credential = await mfaResolver.resolveSignIn(
        TotpMultiFactorGenerator.assertionForSignIn(totpHint.uid, totpCode.trim())
      );
      await finishLogin(credential.user);
    } catch {
      setError("Wrong code. Check your authenticator app and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    const account = pendingUser ?? auth.currentUser;
    if (!account) {
      switchMode("login");
      setError("Log in again so we can resend your verification link.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await sendEmailVerification(account, authActionSettings());
      setInfo(`A new verification link was sent to ${account.email}.`);
    } catch (error) {
      setError(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function checkVerification() {
    const account = pendingUser ?? auth.currentUser;
    if (!account) {
      switchMode("login");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await reload(account);
      if (!account.emailVerified) {
        setError("That email isn't verified yet. Open the latest link we sent you.");
        return;
      }
      await account.getIdToken(true);
      window.location.replace("/feed");
    } catch (error) {
      setError(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function useAnotherAccount() {
    await signOut(auth);
    switchMode("login");
    setEmail("");
  }

  if (mfaResolver) {
    return (
      <AuthShell eyebrow="Two-factor authentication">
        <form onSubmit={handleTotp}>
          <p className="mb-6 text-center text-[13px] leading-relaxed text-meta">
            Enter the 6-digit code from your authenticator app.
          </p>
          <Status error={error} info={null} />
          <label className={label} htmlFor="totp-code">
            Authentication code
          </label>
          <input
            id="totp-code"
            autoFocus
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={totpCode}
            onChange={(event) =>
              setTotpCode(event.target.value.replace(/\D/g, ""))
            }
            placeholder="123456"
            className={`${field} text-center text-xl tracking-[8px]`}
          />
          <button
            type="submit"
            disabled={busy || totpCode.length !== 6}
            className={`${primary} mt-3`}
          >
            {busy ? "Verifying..." : "Verify"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMfaResolver(null);
              setTotpCode("");
              setError(null);
            }}
            className="mt-4 w-full text-center text-xs text-meta transition-colors hover:text-white"
          >
            Back to log in
          </button>
        </form>
      </AuthShell>
    );
  }

  if (mode === "verify") {
    return (
      <AuthShell eyebrow="Check your inbox">
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-edge bg-card">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-5 w-5 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path d="m3 6 9 6 9-6" />
              <rect x="3" y="5" width="18" height="14" rx="2" />
            </svg>
          </div>
          <p className="text-sm leading-relaxed text-body">
            Verify{" "}
            <span className="font-semibold text-white">
              {pendingUser?.email ?? email}
            </span>{" "}
            to
            activate your account and enter the feed.
          </p>
          <Status error={error} info={info} />
          <button
            type="button"
            onClick={checkVerification}
            disabled={busy}
            className={primary}
          >
            {busy ? "Checking..." : "I've verified my email"}
          </button>
          <button
            type="button"
            onClick={resendVerification}
            disabled={busy}
            className="mt-4 w-full text-xs font-semibold text-body transition-colors hover:text-white disabled:opacity-40"
          >
            Resend verification email
          </button>
          <button
            type="button"
            onClick={useAnotherAccount}
            disabled={busy}
            className="mt-3 w-full text-xs text-meta transition-colors hover:text-white disabled:opacity-40"
          >
            Use another account
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow={mode === "signup" ? "Create your account" : "Member access"}>
      {mode !== "reset" && (
        <div className="mb-7 grid grid-cols-2 rounded-xl border border-edge bg-card p-1">
          <button
            type="button"
            onClick={() => switchMode("login")}
            aria-pressed={mode === "login"}
            className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              mode === "login" ? "bg-white text-black" : "text-meta hover:text-white"
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            aria-pressed={mode === "signup"}
            className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
              mode === "signup" ? "bg-white text-black" : "text-meta hover:text-white"
            }`}
          >
            Sign up
          </button>
        </div>
      )}

      {mode === "reset" && (
        <p className="mb-6 text-center text-[13px] leading-relaxed text-meta">
          Enter your email and we&apos;ll send a secure reset link.
        </p>
      )}

      <Status error={error} info={info} />

      <form onSubmit={handleSubmit}>
        {mode === "signup" && (
          <div className="mb-4">
            <label className={label} htmlFor="display-name">
              Display name
            </label>
            <input
              id="display-name"
              type="text"
              required
              minLength={2}
              maxLength={24}
              autoComplete="nickname"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="How friends will see you"
              className={field}
            />
          </div>
        )}

        <div className="mb-4">
          <label className={label} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            className={field}
          />
        </div>

        {mode !== "reset" && (
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <label className={label} htmlFor="password">
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="mb-1.5 text-[10px] font-semibold text-meta hover:text-white"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={mode === "signup" ? 12 : undefined}
              maxLength={mode === "signup" ? 128 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={field}
            />
            {mode === "signup" && (
              <p className="mt-2 text-[11px] leading-relaxed text-meta">
                12+ characters with uppercase, lowercase, and a number.
              </p>
            )}
          </div>
        )}

        {mode === "signup" && (
          <div className="mb-4">
            <label className={label} htmlFor="confirm-password">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className={field}
            />
          </div>
        )}

        <button type="submit" disabled={busy} className={`${primary} mt-2`}>
          {busy
            ? "Please wait..."
            : mode === "login"
              ? "Log in"
              : mode === "signup"
                ? "Create account"
                : "Send reset link"}
        </button>
      </form>

      {mode === "signup" && (
        <p className="mt-4 text-center text-[10px] leading-relaxed text-meta">
          By creating an account, you agree to the{" "}
          <Link href="/terms" className="text-body underline underline-offset-2">
            Terms
          </Link>{" "}
          and acknowledge the{" "}
          <Link href="/privacy" className="text-body underline underline-offset-2">
            Privacy Notice
          </Link>
          .
        </p>
      )}

      <div className="mt-5 text-center text-xs leading-relaxed text-meta">
        {mode === "reset" ? (
          <button onClick={() => switchMode("login")} className="hover:text-white">
            Back to log in
          </button>
        ) : mode === "login" ? (
          <button onClick={() => switchMode("reset")} className="hover:text-white">
            Forgot password?
          </button>
        ) : null}
      </div>
    </AuthShell>
  );
}

function Status({ error, info }: { error: string | null; info: string | null }) {
  return (
    <div aria-live="polite" aria-atomic="true">
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-[#5c1a1a] bg-[#1a0a0a] px-3.5 py-3 text-[13px] leading-snug text-[#ff6b6b]"
        >
          {error}
        </p>
      )}
      {info && (
        <p className="mb-4 rounded-xl border border-[#1a5c2e] bg-[#0a1a0f] px-3.5 py-3 text-[13px] leading-snug text-[#5ee08a]">
          {info}
        </p>
      )}
    </div>
  );
}

function AuthShell({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(255,59,92,0.12),transparent_65%)]"
      />
      <div className="relative w-full max-w-[410px] rounded-3xl border border-line bg-panel/90 p-5 shadow-2xl shadow-black/40 sm:p-8">
        <Link href="/" className="mb-9 block text-center" aria-label="NoPostNow home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-192.png"
            alt=""
            className="mx-auto mb-4 h-16 w-16 rounded-2xl border border-edge"
          />
          <h1 className="text-[30px] font-black leading-none tracking-[-1px]">
            NoPostNow
          </h1>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-[2.4px] text-meta">
            {eyebrow}
          </p>
        </Link>
        {children}
        <p className="mt-8 text-center text-[10px] text-meta">
          Your feed is visible only to verified members.
        </p>
      </div>
    </main>
  );
}
