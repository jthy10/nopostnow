import { Suspense } from "react";
import AuthActionClient from "./AuthActionClient";

export default function AuthActionPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center text-sm text-meta">
          Checking secure link...
        </main>
      }
    >
      <AuthActionClient />
    </Suspense>
  );
}
