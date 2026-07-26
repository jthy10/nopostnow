import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log in or sign up | NoPostNow",
  description:
    "Create a verified NoPostNow account, log in, or securely reset your password.",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
