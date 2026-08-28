import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { hmacIndex } from "@/lib/crypto";
import { fullName } from "@/lib/format";
import Link from "next/link";

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q ?? "").trim();
  const hash = q.includes("@") ? hmacIndex(q) : "";
  const [learners, orgs] = q
    ? await Promise.all([
        prisma.learner.findMany({
          where: {
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { reference: { contains: q } },
              { lineManagerName: { contains: q } },
              ...(hash ? [{ emailHash: hash }] : []),
            ],
          },
          include: { organisation: true },
          take: 25,
        }),
        prisma.organisation.findMany({
          where: {
            OR: [
              { legalName: { contains: q } },
              { dasHolderName: { contains: q } },
              ...(hash ? [{ dasHolderEmailHash: hash }] : []),
            ],
          },
          take: 25,
        }),
      ])
    : [[], []];

  return (
    <div>
      <PageHeader title="Search" description={q ? `Results for “${q}”` : "Type a name, reference or email."} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">People</h2>
          <ul className="space-y-2 text-sm">
            {learners.map((l) => (
              <li key={l.id}>
                <Link href={`/learners/${l.id}`} className="text-tid-navy hover:underline">
                  {fullName(l)}
                </Link>
                <span className="text-neutral-500"> · {l.organisation.legalName}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Organisations</h2>
          <ul className="space-y-2 text-sm">
            {orgs.map((o) => (
              <li key={o.id}>
                <Link href={`/organisations/${o.id}`} className="text-tid-navy hover:underline">
                  {o.legalName}
                </Link>
                <span className="text-neutral-500"> · DAS {o.dasHolderName}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
