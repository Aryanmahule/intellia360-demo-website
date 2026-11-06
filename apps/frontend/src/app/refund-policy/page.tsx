import type { Metadata } from "next";
import LegalPageLayout from "@/components/common/LegalPageLayout";

export const metadata: Metadata = {
  title: "Refund Policy – Intellia360",
  description:
    "Learn about Intellia360's refund eligibility, request process, and refund timelines.",
};

const SUPPORT_EMAIL = "support@intellia360.com";

export default function RefundPolicyPage() {
  return (
    <LegalPageLayout
      title="Refund Policy"
      introduction={
        <>
          <p>
            At Intellia360, we strive to provide high-quality learning
            experiences through our digital platform, educational content, and
            programs. Your satisfaction is important to us.
          </p>
          <p>
            This Refund Policy outlines the conditions under which refunds may
            be requested and processed.
          </p>
        </>
      }
    >
      <section className="legal-document-section" aria-labelledby="refund-fees">
        <h2 id="refund-fees">1. Subscription &amp; Program Fees</h2>
        <p>
          All payments made for Intellia360 Learning Programs, digital content
          access, workshops, or events are considered subscription or program
          fees.
        </p>
      </section>

      <section
        className="legal-document-section"
        aria-labelledby="refund-eligibility"
      >
        <h2 id="refund-eligibility">2. Eligibility for Refunds</h2>
        <p>Refunds may be provided under the following conditions:</p>

        <div className="legal-document-subsection">
          <h3>a. Technical Issues</h3>
          <p>
            If a user is unable to access the platform or content due to
            technical issues from Intellia360&apos;s side, and our support team
            cannot resolve the issue within 7 days, a full refund may be issued.
          </p>
        </div>

        <div className="legal-document-subsection">
          <h3>b. Accidental/Duplicate Payments</h3>
          <p>
            In case of duplicate payments or accidental transactions, users may
            request a refund within 7 days of the transaction date. Verification
            may be required.
          </p>
        </div>

        <div className="legal-document-subsection">
          <h3>c. Dissatisfaction with Program</h3>
          <p>For subscription-based programs:</p>
          <ul>
            <li>
              Users may request a refund within 7 days of purchase if they are
              not satisfied with the program.
            </li>
            <li>
              Refunds will be processed only if less than 20% of the
              course/content has been accessed or used.
            </li>
          </ul>
        </div>

        <div className="legal-document-subsection">
          <h3>d. Event Registrations (Workshops, Hackathons, Competitions)</h3>
          <p>
            Refunds for event registrations can be requested as follows:
          </p>
          <ul>
            <li>7 days before the event date – Full refund.</li>
            <li>Within 3–7 days of the event – 50% refund.</li>
            <li>Within 0–3 days of the event or no-show – No refund.</li>
          </ul>
        </div>
      </section>

      <section
        className="legal-document-section"
        aria-labelledby="refund-nonrefundable"
      >
        <h2 id="refund-nonrefundable">3. Non-Refundable Items</h2>
        <p>The following are not eligible for refunds:</p>
        <ul>
          <li>One-to-one mentoring sessions once delivered.</li>
          <li>Digital downloads or content that has already been accessed.</li>
          <li>
            Services already utilized by the user (teacher enablement, training
            sessions, etc.).
          </li>
        </ul>
      </section>

      <section
        className="legal-document-section"
        aria-labelledby="refund-request"
      >
        <h2 id="refund-request">4. Process for Requesting a Refund</h2>
        <p>To request a refund, users must contact Intellia360 Support.</p>
        <p>
          <strong>Email:</strong>{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </p>
        <p>Include:</p>
        <ul>
          <li>Registered name.</li>
          <li>Mobile/email.</li>
          <li>Payment receipt/transaction ID.</li>
          <li>Reason for refund request.</li>
        </ul>
        <p>Refunds are evaluated within 5–7 working days.</p>
      </section>

      <section
        className="legal-document-section"
        aria-labelledby="refund-method"
      >
        <h2 id="refund-method">5. Refund Method &amp; Timeline</h2>
        <p>Approved refunds will be processed:</p>
        <ul>
          <li>Back to the original mode of payment.</li>
          <li>Within 7–10 working days after approval.</li>
        </ul>
      </section>

      <section
        className="legal-document-section"
        aria-labelledby="refund-changes"
      >
        <h2 id="refund-changes">6. Changes to This Policy</h2>
        <p>
          Intellia360 reserves the right to update or modify this Refund Policy
          at any time. Changes will be posted on our website.
        </p>
      </section>
    </LegalPageLayout>
  );
}
