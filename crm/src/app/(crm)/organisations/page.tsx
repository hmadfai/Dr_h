import { prisma } from "@/lib/prisma";
import { PageHeader, Button, Card, Badge } from "@/components/ui";
import { revealOrganisation } from "@/lib/format";
import { labelOf, LEVY_STATUSES } from "@/lib/constants";
import Link from "next/link";

export default async function OrganisationsPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim();
  const rows = await prisma.organisation.findMany({
    where: q
      ? {
          OR: [
            { legalName: { contains: q } },
            { tradingName: { contains: q } },
            { dasHolderName: { contains: q } },
          ],
        }
      : undefined,
    include: { _count: { select: { learners: true } } },
    orderBy: { legalName: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Employer organisations"
        description="Every organisation on a UK Government-funded apprenticeship must have Digital Apprenticeship Service (DAS) account holder details on file."
        actions={<Button href="/organisations/new">Add organisation</Button>}
      />
      <Card>
        <form className="mb-4">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search legal name or DAS holder"
            className="w-full max-w-md rounded-lg border border-tid-line px-3 py-2 text-sm"
          />
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-tid-line text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="py-2 pr-3">Organisation</th>
                <th className="py-2 pr-3">Levy</th>
                <th className="py-2 pr-3">DAS account holder</th>
                <th className="py-2 pr-3">DAS ID</th>
                <th className="py-2 pr-3">People</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((org) => {
                const revealed = revealOrganisation(org);
                return (
                  <tr key={org.id} className="border-b border-tid-line/60">
                    <td className="py-3 pr-3">
                      <Link href={`/organisations/${org.id}`} className="font-medium text-tid-navy hover:underline">
                        {org.legalName}
                      </Link>
                      <div className="text-xs text-neutral-500">{org.city}</div>
                    </td>
                    <td className="py-3 pr-3">
                      <Badge>{labelOf(LEVY_STATUSES, org.levyStatus)}</Badge>
                    </td>
                    <td className="py-3 pr-3">
                      <div>{org.dasHolderName}</div>
                      <div className="text-xs text-neutral-500">
                        {org.dasHolderJobTitle} · {revealed.dasHolderEmail}
                      </div>
                    </td>
                    <td className="py-3 pr-3 font-mono text-xs">{revealed.dasAccountId}</td>
                    <td className="py-3 pr-3">{org._count.learners}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
