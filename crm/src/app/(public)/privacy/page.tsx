import Link from "next/link";
import { Logo } from "@/components/logo";
import { BRAND } from "@/lib/constants";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-tid-navy text-white">
      <header className="flex items-center justify-between px-8 py-6">
        <Logo />
        <Link href="/login" className="text-sm text-white/80 hover:text-white">
          Staff sign in
        </Link>
      </header>
      <article className="mx-auto max-w-3xl px-6 pb-16 text-sm leading-6 text-white/85">
        <h1 className="text-3xl font-semibold text-white">Privacy, encryption and UK GDPR</h1>
        <p className="mt-4">
          Training in Data (“we”) operates this CRM as a training-provider system for student recruitment and the
          administration of UK Government-funded apprenticeships. We act as controller for CRM staff accounts and, for
          funded apprentices, process learner and employer data under contract and legal obligation (including ESFA / DfE
          Individualised Learner Record requirements).
        </p>
        <h2 className="mt-8 text-lg font-semibold text-white">What we record</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Prospect and apprentice identity, contact and eligibility information</li>
          <li>Workplace line manager details (required for every prospect)</li>
          <li>Employer organisation and Digital Apprenticeship Service (DAS) account holder details</li>
          <li>Programme progress, off-the-job hours, anomalies, withdrawals and re-engagement activity</li>
          <li>Consent, privacy-notice acknowledgements, and data-rights requests including erasure</li>
        </ul>
        <h2 className="mt-8 text-lg font-semibold text-white">Lawful bases</h2>
        <p className="mt-2">
          Delivery of an apprenticeship is processed under contract and legal obligation. Marketing and optional media use
          require consent, which can be withdrawn. Special-category learning-support data requires explicit consent.
        </p>
        <h2 className="mt-8 text-lg font-semibold text-white">Encryption and security</h2>
        <p className="mt-2">
          Contact details, national insurance numbers, ULNs, addresses, DAS identifiers and email contents are encrypted at
          rest with AES-256-GCM. Passwords are hashed. Staff access is role-based and written to an audit log. Production
          deployments must terminate TLS in transit.
        </p>
        <h2 className="mt-8 text-lg font-semibold text-white">Your rights</h2>
        <p className="mt-2">
          You may request access, rectification, erasure, restriction, objection or portability. Erasure of a funded
          apprentice may be limited where we must retain anonymised ILR/funding evidence. People who require removal are
          placed on a suppression register so they are not re-imported. Contact {BRAND.email}. Privacy notice version{" "}
          {BRAND.privacyNoticeVersion}. {BRAND.icoNote}
        </p>
      </article>
    </div>
  );
}
