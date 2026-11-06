import type { Metadata } from "next";
import Link from "next/link";
import LegalPageLayout from "@/components/common/LegalPageLayout";

export const metadata: Metadata = {
  title: "Privacy Policy – Intellia360",
  description:
    "Learn how Intellia360 collects, uses, shares, and protects personal information.",
};

const SUPPORT_EMAIL = "support@intellia360.com";

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      updatedDate="30 October 2026"
      introduction={
        <>
          <p>
            Intellia360 is committed to protecting your privacy. This Privacy
            Policy explains how we collect, use, disclose, and safeguard your
            information when you visit our website, use our digital learning
            platform, or interact with any of our services.
          </p>
          <p>
            By using our website or services, you agree to the practices
            described in this Policy.
          </p>
        </>
      }
    >
      <section
        className="legal-document-section"
        aria-labelledby="privacy-collection"
      >
        <h2 id="privacy-collection">1. Information We Collect</h2>

        <div className="legal-document-subsection">
          <h3>A. Personal Information</h3>
          <p>
            We may collect the following personal information when you register
            or interact with our platform:
          </p>
          <ul>
            <li>Name.</li>
            <li>Email address.</li>
            <li>Phone number.</li>
            <li>School or organization details.</li>
            <li>Student details (name, grade, age).</li>
            <li>Login information.</li>
          </ul>
        </div>

        <div className="legal-document-subsection">
          <h3>B. Non-Personal Information</h3>
          <ul>
            <li>Browser type.</li>
            <li>Device information.</li>
            <li>IP address.</li>
            <li>Pages viewed.</li>
            <li>Usage data and analytics.</li>
          </ul>
        </div>

        <div className="legal-document-subsection">
          <h3>C. Cookies &amp; Tracking</h3>
          <p>
            We may use cookies and similar technologies to enhance user
            experience and track website performance.
          </p>
        </div>
      </section>

      <section className="legal-document-section" aria-labelledby="privacy-use">
        <h2 id="privacy-use">2. How We Use Your Information</h2>
        <p>We use collected information to:</p>
        <ul>
          <li>Provide access to the Intellia360 learning platform.</li>
          <li>Improve platform performance and user experience.</li>
          <li>
            Communicate important updates, notifications, or support messages.
          </li>
          <li>Customize learning content for students.</li>
          <li>Analyse usage patterns to enhance our services.</li>
          <li>Maintain security and prevent unauthorized access.</li>
        </ul>
      </section>

      <section
        className="legal-document-section"
        aria-labelledby="privacy-sharing"
      >
        <h2 id="privacy-sharing">3. How We Share Your Information</h2>
        <p>We do NOT sell your personal information.</p>
        <p>We may share information only with:</p>
        <ul>
          <li>
            Authorized service providers (hosting, analytics tools, payment
            gateways).
          </li>
          <li>School administrators/teachers associated with student accounts.</li>
          <li>
            Legal authorities, only when required by law or to protect user
            safety.
          </li>
        </ul>
        <p>
          All partners follow strict confidentiality and data protection
          standards.
        </p>
      </section>

      <section
        className="legal-document-section"
        aria-labelledby="privacy-security"
      >
        <h2 id="privacy-security">4. Data Protection &amp; Security</h2>
        <p>
          We take appropriate technical and organizational measures to
          safeguard your data, including:
        </p>
        <ul>
          <li>Encrypted data transmission (SSL).</li>
          <li>Secure servers.</li>
          <li>Access control and authentication systems.</li>
          <li>Regular security audits.</li>
        </ul>
        <p>
          However, no system is 100% secure. Users are advised to keep their
          login credentials confidential.
        </p>
      </section>

      <section className="legal-document-section" aria-labelledby="privacy-children">
        <h2 id="privacy-children">5. Children&apos;s Privacy</h2>
        <p>Intellia360 provides services for students.</p>
        <p>
          We collect student information only with the consent of the school,
          parent, or guardian.
        </p>
        <p>
          We strictly follow child data protection norms and never use student
          data for advertising or sales.
        </p>
      </section>

      <section className="legal-document-section" aria-labelledby="privacy-rights">
        <h2 id="privacy-rights">6. Your Rights</h2>
        <p>Depending on your location, you may have the right to:</p>
        <ul>
          <li>Access your personal information.</li>
          <li>Request correction or update.</li>
          <li>Request deletion of your data.</li>
          <li>Withdraw consent.</li>
          <li>Request a copy of your stored data.</li>
        </ul>
        <p>
          To exercise these rights, contact us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </section>

      <section
        className="legal-document-section"
        aria-labelledby="privacy-third-party"
      >
        <h2 id="privacy-third-party">7. Third-Party Links</h2>
        <p>
          Our website may contain links to external websites. We are not
          responsible for their privacy practices or content.
        </p>
      </section>

      <section
        className="legal-document-section"
        aria-labelledby="privacy-changes"
      >
        <h2 id="privacy-changes">8. Changes to This Privacy Policy</h2>
        <p>We may update this Privacy Policy from time to time.</p>
        <p>
          Any changes will be posted on this page with the updated date.
        </p>
      </section>

      <section className="legal-document-section" aria-labelledby="privacy-contact">
        <h2 id="privacy-contact">9. Contact Us</h2>
        <p>
          For any questions, concerns, or requests related to this Privacy
          Policy, contact:
        </p>
        <p><strong>Intellia360</strong></p>
        <p>
          Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
        <p>Website: <Link href="/">Intellia360 website</Link>.</p>
        <p>Address: Maharashtra, India.</p>
      </section>
    </LegalPageLayout>
  );
}
