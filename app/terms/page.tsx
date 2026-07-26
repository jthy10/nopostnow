import type { Metadata } from "next";
import LegalPage, { LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms | NoPostNow",
  description: "Terms for using the hosted NoPostNow service.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      intro="These terms apply to the hosted service at nopostnow.com. The open-source code is separately provided under the repository's MIT License."
    >
      <LegalSection title="Eligibility and accounts">
        <p>
          You must be at least 18 years old and able to agree to these terms. Provide
          accurate account information, keep your credentials secure, and promptly
          report suspected unauthorized access. You are responsible for activity under
          your account.
        </p>
      </LegalSection>

      <LegalSection title="Using NoPostNow">
        <p>
          You may use the service for lawful personal social sharing. Do not harass
          people, impersonate others, invade privacy, exploit minors, distribute
          malware, evade access controls, scrape member data, interfere with the
          service, or post content that is unlawful or that you do not have the right to
          share.
        </p>
        <p>
          Automated abuse, credential attacks, bulk account creation, spam, and attempts
          to discover or misuse other members&apos; private information are prohibited.
        </p>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          You keep ownership of content you submit. You give the service a limited,
          worldwide, non-exclusive license to host, copy, process, display, and transmit
          that content only as needed to operate, secure, improve, and administer
          NoPostNow. This license ends when the content is deleted, subject to reasonable
          backup, moderation, legal, and shared-conversation retention.
        </p>
        <p>
          You are responsible for your content and for obtaining permission from people
          depicted or whose information you share.
        </p>
      </LegalSection>

      <LegalSection title="Moderation and account action">
        <p>
          Administrators may remove or hide content, limit posting, suspend accounts, or
          preserve evidence when reasonably necessary to enforce these terms, protect
          members, maintain the service, or comply with law. Serious or repeated
          violations can result in termination.
        </p>
      </LegalSection>

      <LegalSection title="Service availability">
        <p>
          The hosted service is provided on an “as available” basis. Features may change,
          fail, or be discontinued, and data loss is possible. To the extent permitted by
          law, no warranties are made about uninterrupted availability, fitness for a
          particular purpose, or freedom from every defect.
        </p>
      </LegalSection>

      <LegalSection title="Responsibility">
        <p>
          To the extent permitted by law, the service&apos;s operators and contributors
          are not liable for indirect, incidental, special, consequential, or punitive
          damages, lost data, lost profits, or harm caused by other members. Rights that
          cannot legally be limited remain unaffected.
        </p>
      </LegalSection>

      <LegalSection title="Privacy, changes, and contact">
        <p>
          The Privacy Notice explains data practices. These terms may be updated as the
          service evolves; continued use after an updated version takes effect means you
          accept it. For account or privacy help, use the private feedback form in
          Settings. Report security issues through the repository&apos;s private security
          advisory form.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
