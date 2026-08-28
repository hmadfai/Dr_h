import { prisma } from "@/lib/prisma";
import { PageHeader, Button, Card, Badge, statusTone } from "@/components/ui";
import { fullName, otjPercent } from "@/lib/format";
import { labelOf, LEARNER_STATUSES, PIPELINE_STAGES } from "@/lib/constants";
import Link from "next/link";

export default async function LearnersPage({ searchParams }: { searchParams: { status?: string; q?: string } }) {
  const q = searchParams.q?.trim();
  const status = searchParams.status;
  const rows = await prisma.learner.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
              { reference: { contains: q } },
              { lineManagerName: { contains: q } },
            ],
          }
        : {}),
    },
    include: { organisation: true, programme: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <div>
      <PageHeader
        title="Learners & prospects"
        description="Student recruitment and on-programme people. Line manager details are mandatory on every record."
        actions={<Button href="/learners/new">New prospect</Button>}
      />
      <Card>
        <form className="mb-4 flex flex-wrap gap-2">
          <input name="q" defaultValue={q} placeholder="Search name, reference or line manager" className="w-full max-w-sm rounded-lg border border-tid-line px-3 py-2 text-sm" />
          <select name="status" defaultValue={status ?? ""} className="rounded-lg border border-tid-line px-3 py-2 text-sm">
            <option value="">All statuses</option>
            {LEARNER_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-tid-line text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="py-2 pr-3">Learner</th>
                <th className="py-2 pr-3">Organisation</th>
                <th className="py-2 pr-3">Line manager</th>
                <th className="py-2 pr-3">Stage</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">OTJ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-tid-line/60">
                  <td className="py-3 pr-3">
                    <Link href={`/learners/${row.id}`} className="font-medium text-tid-navy hover:underline">
                      {fullName(row)}
                    </Link>
                    <div className="text-xs text-neutral-500">
                      {row.reference}
                      {row.programme ? ` · ${row.programme.name}` : ""}
                    </div>
                  </td>
                  <td className="py-3 pr-3">
                    <Link href={`/organisations/${row.organisationId}`} className="hover:underline">
                      {row.organisation.legalName}
                    </Link>
                  </td>
                  <td className="py-3 pr-3">
                    {row.lineManagerName}
                    <div className="text-xs text-neutral-500">{row.lineManagerJobTitle}</div>
                  </td>
                  <td className="py-3 pr-3">{labelOf(PIPELINE_STAGES, row.pipelineStage)}</td>
                  <td className="py-3 pr-3">
                    <Badge tone={statusTone(row.status)}>{labelOf(LEARNER_STATUSES, row.status)}</Badge>
                  </td>
                  <td className="py-3 pr-3">{otjPercent(row)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
