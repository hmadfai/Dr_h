import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <h1 className="text-2xl font-semibold text-tid-navy">Not found</h1>
      <p className="mt-2 text-sm text-neutral-600">That record is not in the Training in Data CRM.</p>
      <Link href="/dashboard" className="mt-4 inline-block text-sm font-medium text-tid-accent hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
