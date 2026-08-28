import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, Button } from "@/components/ui";
import { OrganisationForm } from "@/components/organisation-form";
import { revealOrganisation, fullName } from "@/lib/format";
import { labelOf, LEVY_STATUSES, LEARNER_STATUSES } from "@/lib/constants";
import Link from "next/link";

export default async function OrganisationDetailPage({ params }: { params: { id: string } }) {
  const org = await prisma.organisation.findUnique({
    where: { id: params.id },
    include: { learners: { orderBy: { lastName: "asc" } }, consents: { orderBy: { givenAt: "desc" }, take: 8 } },
  });
  if (!org) notFound();
  const revealed = revealOrganisation(org);

  return (
    <div>
      <PageHeader
        title={org.legalName}
        description={`${org.city} · ${labelOf(LEVY_STATUSES, org.levyStatus)} · DAS holder ${org.dasHolderName}`}
        actions={<Button href={`/learners/new?organisationId=${org.id}`}>Add prospect</Button>}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <OrganisationForm org={revealed} />
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-semibold">People at this employer</h2>
            <ul className="space-y-2 text-sm">
              {org.learners.map((learner) => (
                <li key={learner.id} className="flex items-center justify-between gap-2">
                  <Link href={`/learners/${learner.id}`} className="text-tid-navy hover:underline">
                    {fullName(learner)}
                  </Link>
                  <Badge>{labelOf(LEARNER_STATUSES, learner.status)}</Badge>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">DAS holder consents</h2>
            <ul className="space-y-2 text-xs text-neutral-600">
              {org.consents.map((c) => (
                <li key={c.id}>
                  {c.purpose.replaceAll("_", " ")} · {c.given ? "given" : "withdrawn"} · {c.lawfulBasis.toLowerCase()}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
