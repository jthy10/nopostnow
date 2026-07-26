"use client";

import Link from "next/link";
import { reload } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";

type View = "ready" | "working" | "success" | "error";

export default function VerifyEmailClient({ token }: { token: string }) {
  const [view, setView] = useState<View>("ready");
  const [message, setMessage] = useState(
    "Confirm that this is the email you want to use with NoPostNow.",
  );
  const [destination, setDestination] = useState("/login");
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!redirecting) return;
    const timer = window.setTimeout(() => {
      window.location.replace("/feed");
    }, 900);
    return () => window.clearTimeout(timer);
  }, [redirecting]);

  async function confirmEmail() {
    setView("working");
    setMessage("Securing your account...");

    try {
      const response = await fetch("/api/auth/confirm-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string; verified?: boolean }
        | null;

      if (!response.ok || !result?.verified) {
        if (response.status === 410) {
          throw new Error(
            "This confirmation link has expired. Log in and request a new one.",
          );
        }
        if (response.status === 404) {
          throw new Error(
            "This confirmation link is invalid or has already been used.",
          );
        }
        throw new Error("We couldn't confirm this email. Please try again.");
      }

      // Firebase restores browser persistence asynchronously. Waiting here
      // avoids treating a still-hydrating signup session as signed out.
      await auth.authStateReady();
      const account = auth.currentUser;
      if (account) {
        try {
          await reload(account);
          if (account.emailVerified) {
            await account.getIdToken(true);
            setDestination("/feed");
            setMessage("Your email is confirmed. Opening your feed...");
            setView("success");
            setRedirecting(true);
            return;
          }
        } catch {
          // The server already confirmed the address. If this browser cannot
          // refresh its local session, the user can simply log in again.
        }
      }

      setMessage("Your email is confirmed. Your NoPostNow account is ready.");
      setView("success");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "We couldn't confirm this email. Please try again.",
      );
      setView("error");
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,59,92,0.16),transparent_42%)]"
      />
      <section className="relative w-full max-w-[430px] overflow-hidden rounded-[28px] border border-edge bg-panel/95 shadow-2xl shadow-black/50">
        <div className="h-1 bg-heart" />
        <div className="p-6 text-center sm:p-9">
          <Link href="/" aria-label="NoPostNow home" className="inline-block">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-heart text-[28px] font-black shadow-lg shadow-heart/15">
              N
            </span>
            <span className="mt-4 block text-[28px] font-black tracking-[-1px]">
              NoPostNow
            </span>
          </Link>

          <div className="mx-auto my-7 h-px max-w-24 bg-edge" />

          {view === "success" ? (
            <div
              className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-[#1f6b39] bg-[#0d2415] text-[#5ee08a]"
              aria-hidden
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-7 w-7"
              >
                <path d="m5 12 4 4L19 6" />
              </svg>
            </div>
          ) : (
            <p className="text-[10px] font-bold uppercase tracking-[2.2px] text-meta">
              Email confirmation
            </p>
          )}

          <h1 className="mt-3 text-[30px] font-black leading-tight tracking-[-1px]">
            {view === "success"
              ? "You’re in."
              : view === "error"
                ? "Link problem."
                : "One last step."}
          </h1>
          <p
            aria-live="polite"
            className={`mx-auto mt-4 max-w-[330px] text-sm leading-7 ${
              view === "error" ? "text-[#ff6b6b]" : "text-body"
            }`}
          >
            {message}
          </p>

          {view === "ready" && (
            <button
              type="button"
              onClick={confirmEmail}
              className="mt-7 w-full rounded-xl bg-white px-5 py-4 text-sm font-extrabold text-black transition-opacity hover:opacity-90 active:opacity-75"
            >
              Confirm my email
            </button>
          )}
          {view === "working" && (
            <button
              type="button"
              disabled
              className="mt-7 w-full cursor-wait rounded-xl bg-white px-5 py-4 text-sm font-extrabold text-black opacity-50"
            >
              Confirming...
            </button>
          )}
          {view === "success" && (
            <Link
              href={destination}
              className="mt-7 inline-block w-full rounded-xl bg-white px-5 py-4 text-sm font-extrabold text-black transition-opacity hover:opacity-90 active:opacity-75"
            >
              {redirecting
                ? "Opening your feed..."
                : destination === "/feed"
                  ? "Enter NoPostNow"
                  : "Continue to log in"}
            </Link>
          )}
          {view === "error" && (
            <Link
              href="/login"
              className="mt-7 inline-block w-full rounded-xl border border-edge bg-card px-5 py-4 text-sm font-bold text-white transition-colors hover:border-meta"
            >
              Back to account access
            </Link>
          )}

          <p className="mt-7 text-[10px] leading-5 text-meta">
            This page confirms your email only after you press the button.
          </p>
        </div>
      </section>
    </main>
  );
}
