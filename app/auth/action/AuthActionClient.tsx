"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  sendPasswordResetEmail,
  validatePassword,
  verifyPasswordResetCode,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth } from "@/lib/firebase";

type View = "working" | "reset" | "success" | "error";

function actionError(error: unknown) {
  const code = error instanceof FirebaseError ? error.code : "";
  if (/expired-action-code/.test(code)) {
    return "This secure link has expired. Request a new one and try again.";
  }
  if (/invalid-action-code/.test(code)) {
    return "This secure link is invalid or has already been used.";
  }
  if (/weak-password|password-does-not-meet-requirements/.test(code)) {
    return "Use at least 12 characters with uppercase, lowercase, and a number.";
  }
  if (/too-many-requests|quota-exceeded/.test(code)) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  return "We couldn't complete this request. Please try again.";
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

const field =
  "w-full rounded-xl border border-edge bg-card px-3.5 py-3.5 text-[16px] text-white outline-none transition-colors focus:border-meta";
const button =
  "w-full rounded-xl bg-white p-3.5 text-sm font-extrabold text-black transition-opacity hover:opacity-90 disabled:opacity-40";

export default function AuthActionClient() {
  const searchParams = useSearchParams();
  const started = useRef(false);
  const initialLinkIsValid = Boolean(
    searchParams.get("mode") && searchParams.get("oobCode")
  );
  const [view, setView] = useState<View>(
    initialLinkIsValid ? "working" : "error"
  );
  const [message, setMessage] = useState(
    initialLinkIsValid
      ? "Checking your secure link..."
      : "This secure link is incomplete."
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const mode = searchParams.get("mode");
  const code = searchParams.get("oobCode");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!mode || !code) {
      return;
    }

    void (async () => {
      try {
        if (mode === "resetPassword") {
          const accountEmail = await verifyPasswordResetCode(auth, code);
          setEmail(accountEmail);
          setView("reset");
          return;
        }

        if (mode === "verifyEmail") {
          await applyActionCode(auth, code);
          setMessage("Your email is verified. You can enter NoPostNow now.");
          setView("success");
          return;
        }

        if (mode === "recoverEmail") {
          const info = await checkActionCode(auth, code);
          const restoredEmail = info.data.email;
          await applyActionCode(auth, code);
          if (restoredEmail) {
            await sendPasswordResetEmail(auth, restoredEmail, {
              url: `${window.location.origin}/login`,
            });
          }
          setMessage(
            "Your email was restored. We also sent a password reset link to secure the account."
          );
          setView("success");
          return;
        }

        setMessage("This type of secure link isn't supported.");
        setView("error");
      } catch (error) {
        setMessage(actionError(error));
        setView("error");
      }
    })();
  }, [code, mode]);

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!code) return;
    setBusy(true);
    setMessage("");
    try {
      if (password !== confirmPassword) throw new Error("Passwords don't match.");
      const invalidPassword = await passwordError(password);
      if (invalidPassword) throw new Error(invalidPassword);
      await confirmPasswordReset(auth, code, password);
      setMessage("Your password has been updated. You can log in now.");
      setPassword("");
      setConfirmPassword("");
      setView("success");
    } catch (error) {
      setMessage(
        error instanceof Error && !(error instanceof FirebaseError)
          ? error.message
          : actionError(error)
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(255,59,92,0.12),transparent_65%)]"
      />
      <section className="relative w-full max-w-[410px] rounded-3xl border border-line bg-panel/90 p-6 shadow-2xl shadow-black/40 sm:p-8">
        <Link href="/" className="mb-8 block text-center" aria-label="NoPostNow home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icon-192.png"
            alt=""
            className="mx-auto mb-4 h-16 w-16 rounded-2xl border border-edge"
          />
          <h1 className="text-[28px] font-black tracking-[-1px]">NoPostNow</h1>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[2.2px] text-meta">
            Secure account action
          </p>
        </Link>

        {view === "reset" ? (
          <form onSubmit={resetPassword}>
            <p className="mb-6 text-center text-[13px] leading-relaxed text-meta">
              Choose a new password for{" "}
              <span className="font-semibold text-body">{email}</span>.
            </p>
            {message && (
              <p role="alert" className="mb-4 text-[13px] leading-relaxed text-[#ff6b6b]">
                {message}
              </p>
            )}
            <label
              htmlFor="new-password"
              className="mb-1.5 block text-[10px] font-bold uppercase tracking-[1.5px] text-meta"
            >
              New password
            </label>
            <input
              id="new-password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={field}
            />
            <p className="mb-4 mt-2 text-[11px] leading-relaxed text-meta">
              12+ characters with uppercase, lowercase, and a number.
            </p>
            <label
              htmlFor="confirm-new-password"
              className="mb-1.5 block text-[10px] font-bold uppercase tracking-[1.5px] text-meta"
            >
              Confirm password
            </label>
            <input
              id="confirm-new-password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className={field}
            />
            <button type="submit" disabled={busy} className={`${button} mt-5`}>
              {busy ? "Updating..." : "Update password"}
            </button>
          </form>
        ) : (
          <div className="text-center" aria-live="polite">
            <p
              className={`text-sm leading-relaxed ${
                view === "error" ? "text-[#ff6b6b]" : "text-body"
              }`}
            >
              {message}
            </p>
            {view !== "working" && (
              <Link href="/login" className={`${button} mt-6 inline-block`}>
                {view === "success" ? "Continue to log in" : "Back to account access"}
              </Link>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
