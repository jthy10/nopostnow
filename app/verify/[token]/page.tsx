import type { Metadata } from "next";
import VerifyEmailClient from "./VerifyEmailClient";

export const metadata: Metadata = {
  title: "Confirm your email | NoPostNow",
  description: "Securely confirm your NoPostNow email address.",
  robots: { index: false, follow: false },
};

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <VerifyEmailClient token={token} />;
}
