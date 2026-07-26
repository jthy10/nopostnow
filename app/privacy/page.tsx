import type { Metadata } from "next";
import LegalPage, { LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Notice | NoPostNow",
  description: "How NoPostNow collects, uses, protects, and retains member data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Notice"
      intro="This notice explains what the hosted NoPostNow service processes when you create an account and use the app. The open-source software can also be self-hosted; other operators are responsible for their own practices."
    >
      <LegalSection title="Information we process">
        <p>
          We process account information such as your email address, display name,
          Firebase account identifier, verification status, and account timestamps.
          Firebase Authentication processes your password; NoPostNow does not store or
          receive the readable password.
        </p>
        <p>
          We also process content and activity you choose to create, including photos,
          captions, comments, reactions, direct messages, profile images, feedback,
          blocks, notification preferences, and account settings.
        </p>
        <p>
          Basic technical records may include sign-in timestamps, session and
          installation state, browser or device push endpoints, IP-derived service
          logs, and security or diagnostic events.
        </p>
      </LegalSection>

      <LegalSection title="How information is used">
        <p>
          We use this information to authenticate accounts, provide the feed and
          messaging features, deliver notifications, operate account controls, prevent
          abuse, investigate failures, enforce the Terms, and protect the service and
          its members.
        </p>
        <p>NoPostNow does not sell personal information or use it to serve ads.</p>
      </LegalSection>

      <LegalSection title="Who can see what">
        <p>
          Verified members can see public-in-the-service profile information, posts,
          captions, comments, and reactions. Direct messages are restricted to their
          participants. Account email addresses, push endpoints, notification settings,
          and other private account records are restricted to the account owner,
          administrators where operationally necessary, and trusted service systems.
        </p>
        <p>
          Do not post information you are not comfortable sharing with every verified
          member of the hosted community.
        </p>
      </LegalSection>

      <LegalSection title="Service providers">
        <p>
          The hosted service relies on providers including Firebase and Google Cloud
          for authentication, databases, file storage, and infrastructure; Vercel for
          web delivery and server execution; Resend for transactional account
          confirmation email; and browser push services for notifications you enable.
          These providers process data under their own terms and security practices.
        </p>
        <p>
          Information may also be disclosed when reasonably necessary to comply with
          law, respond to valid legal process, protect people or the service, or address
          fraud and security incidents.
        </p>
      </LegalSection>

      <LegalSection title="Storage, retention, and deletion">
        <p>
          Authentication state and limited feed or app data may be stored locally in
          your browser so the app stays signed in and loads efficiently. You can clear
          this through your browser controls.
        </p>
        <p>
          Account deletion is available in Settings. It removes the login, profile, and
          private settings. Posts are hidden and may be retained for recovery,
          moderation, security, or backup purposes. Comments already added to shared
          conversations and direct-message thread history may remain for other
          participants. Legal or security needs can require longer retention.
        </p>
      </LegalSection>

      <LegalSection title="Security and your choices">
        <p>
          No system is perfectly secure, but NoPostNow uses verified-email access,
          provider-managed password authentication, restrictive database and storage
          rules, encrypted transport, administrative MFA, and limited privileged access.
        </p>
        <p>
          Settings lets you update profile and account details, change your password,
          export available account data, manage notifications, block members, send
          private feedback to administrators, and delete your account.
        </p>
      </LegalSection>

      <LegalSection title="Age and changes">
        <p>
          The hosted service is intended for adults age 18 and older. We may update this
          notice as the service changes. The effective date above identifies the current
          version.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
