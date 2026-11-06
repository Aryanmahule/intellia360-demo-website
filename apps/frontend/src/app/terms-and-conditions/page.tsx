import type { Metadata } from "next";
import Link from "next/link";
import LegalPageLayout from "@/components/common/LegalPageLayout";

export const metadata: Metadata = {
  title: "Terms & Conditions – Intellia360",
  description:
    "Read the terms and conditions for accessing and using Intellia360.",
};

const SUPPORT_EMAIL = "support@intellia360.com";

export default function TermsAndConditionsPage() {
  return (
    <LegalPageLayout
      title="Terms & Conditions"
      updatedDate="30 October 2026"
      introduction={
        <>
          <p>
            Welcome to Intellia360 (referred to as &quot;we&quot;,
            &quot;our&quot;, or &quot;us&quot;). By accessing or using our
            website, digital platform, content, and services, you agree to
            comply with the following Terms &amp; Conditions.
          </p>
          <p>Please read them carefully before using the website.</p>
        </>
      }
    >
      <section className="legal-document-section" aria-labelledby="terms-acceptance">
        <h2 id="terms-acceptance">1. Acceptance of Terms</h2>
        <p>
          By accessing or using the Intellia360 website, you agree to be bound
          by these Terms &amp; Conditions, our{" "}
          <Link href="/privacy-policy">Privacy Policy</Link>, and any additional
          guidelines or rules that may apply to specific services.
        </p>
        <p>
          If you do not agree with any part of these terms, please discontinue
          use of the website immediately.
        </p>
      </section>

      <section className="legal-document-section" aria-labelledby="terms-about">
        <h2 id="terms-about">2. About Intellia360</h2>
        <p>
          Intellia360 is an educational platform offering interactive learning
          content, gamified modules, digital learning materials, and
          student/teacher engagement tools.
        </p>
        <p>
          We may update or modify content, features, or services at any time
          without prior notice.
        </p>
      </section>

      <section
        className="legal-document-section"
        aria-labelledby="terms-eligibility"
      >
        <h2 id="terms-eligibility">3. User Eligibility</h2>
        <p>You must be at least 18 years old to register and create an account.</p>
        <p>
          For students below 18, accounts must be created and supervised by a
          parent, guardian, or authorized school representative.
        </p>
      </section>

      <section className="legal-document-section" aria-labelledby="terms-accounts">
        <h2 id="terms-accounts">4. User Accounts</h2>
        <p>When you create an account:</p>
        <ul>
          <li>You agree to provide accurate and updated information.</li>
          <li>
            You are responsible for maintaining the confidentiality of your
            login details.
          </li>
          <li>You are accountable for all activities conducted under your account.</li>
        </ul>
        <p>
          We reserve the right to suspend or terminate accounts found in
          violation of these terms.
        </p>
      </section>

      <section className="legal-document-section" aria-labelledby="terms-use">
        <h2 id="terms-use">5. Use of the Website &amp; Platform</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the platform for any illegal or unauthorized purpose.</li>
          <li>Attempt to hack, disrupt, or misuse the website or its systems.</li>
          <li>Copy, distribute, or reverse-engineer any part of the platform.</li>
          <li>Upload harmful, abusive, or misleading content.</li>
        </ul>
        <p>
          All content—including text, graphics, games, videos, and software—is
          the intellectual property of Intellia360 and protected by copyright
          laws.
        </p>
      </section>

      <section className="legal-document-section" aria-labelledby="terms-fees">
        <h2 id="terms-fees">6. Subscription, Fees &amp; Payments</h2>
        <p>Some services may require paid subscriptions or school partnerships.</p>
        <p>By purchasing, you agree to:</p>
        <ul>
          <li>Provide accurate payment information.</li>
          <li>Accept pricing, renewal terms, and billing cycles.</li>
          <li>
            Understand that fees are non-refundable unless specified in our{" "}
            <Link href="/refund-policy">Refund Policy</Link>.
          </li>
        </ul>
        <p>
          Schools/organizations entering agreements must follow the terms stated
          in their official contract.
        </p>
      </section>

      <section className="legal-document-section" aria-labelledby="terms-learning">
        <h2 id="terms-learning">7. Learning Content &amp; Educational Materials</h2>
        <p>
          Intellia360 provides learning content designed for student
          development.
        </p>
        <p>However:</p>
        <ul>
          <li>We do not guarantee specific academic outcomes.</li>
          <li>
            Content may be updated, modified, or discontinued as part of
            continuous improvement.
          </li>
          <li>
            Teachers and schools are responsible for ensuring appropriate
            implementation.
          </li>
        </ul>
      </section>

      <section
        className="legal-document-section"
        aria-labelledby="terms-third-party"
      >
        <h2 id="terms-third-party">8. Third-Party Links</h2>
        <p>
          Our website may contain links to third-party websites. Intellia360 is
          not responsible for the accuracy, security, or content of external
          sites.
        </p>
      </section>

      <section
        className="legal-document-section"
        aria-labelledby="terms-liability"
      >
        <h2 id="terms-liability">9. Limitation of Liability</h2>
        <p>Intellia360 is not liable for:</p>
        <ul>
          <li>Any direct, indirect, incidental, or consequential damages.</li>
          <li>Loss of data, revenue, or profits.</li>
          <li>
            Issues arising from unauthorized access or technical disruptions.
          </li>
        </ul>
        <p>Use of the platform is at your own risk.</p>
      </section>

      <section
        className="legal-document-section"
        aria-labelledby="terms-indemnification"
      >
        <h2 id="terms-indemnification">10. Indemnification</h2>
        <p>
          You agree to indemnify and hold Intellia360, its founders, employees,
          and partners harmless from any claims, losses, or damages arising from:
        </p>
        <ul>
          <li>Misuse of the platform.</li>
          <li>Violation of these Terms &amp; Conditions.</li>
          <li>Infringement of rights or applicable laws.</li>
        </ul>
      </section>

      <section
        className="legal-document-section"
        aria-labelledby="terms-termination"
      >
        <h2 id="terms-termination">11. Termination</h2>
        <p>We may suspend or terminate access if:</p>
        <ul>
          <li>You violate terms.</li>
          <li>Engage in fraudulent or harmful activity.</li>
          <li>A school or partner&apos;s agreement ends.</li>
        </ul>
        <p>Upon termination, your right to use the platform ends immediately.</p>
      </section>

      <section className="legal-document-section" aria-labelledby="terms-changes">
        <h2 id="terms-changes">12. Changes to Terms</h2>
        <p>Intellia360 may modify these Terms &amp; Conditions at any time.</p>
        <p>Changes become effective once posted on the website.</p>
        <p>
          Continued use of the platform signifies acceptance of the updated
          terms.
        </p>
      </section>

      <section className="legal-document-section" aria-labelledby="terms-law">
        <h2 id="terms-law">13. Governing Law</h2>
        <p>These Terms &amp; Conditions are governed by the laws of India.</p>
        <p>
          Any disputes shall fall under the jurisdiction of courts located in
          Amravati, Maharashtra.
        </p>
      </section>

      <section
        className="legal-document-section"
        aria-labelledby="terms-contact"
      >
        <h2 id="terms-contact">14. Contact Information</h2>
        <p>For queries, support, or legal concerns, contact:</p>
        <p><strong>Intellia360</strong></p>
        <p>
          Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
        <p>Location: Maharashtra, India.</p>
      </section>
    </LegalPageLayout>
  );
}
