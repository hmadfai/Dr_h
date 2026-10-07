import { PageHeader } from "@/components/ui";
import { LearnerForm } from "@/components/learner-form";
import { prisma } from "@/lib/prisma";

export default async function NewLearnerPage({ searchParams }: { searchParams: { organisationId?: string } }) {
  const [organisations, programmes] = await Promise.all([
    prisma.organisation.findMany({ orderBy: { legalName: "asc" } }),
    prisma.programme.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader
        title="New prospect"
        description="Capture the learner, their employer, and — required — their workplace line manager. Consent is recorded at create time."
      />
      {organisations.length === 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Add an employer organisation with DAS account holder details before creating a prospect.
        </p>
      ) : (
        <LearnerForm
          organisations={organisations}
          programmes={programmes}
          defaultOrganisationId={searchParams.organisationId}
        />
      )}
    </div>
  );
}
