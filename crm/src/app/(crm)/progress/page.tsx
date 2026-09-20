import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge } from "@/components/ui";
import { fullName, formatDate, otjPercent } from "@/lib/format";
import Link from "next/link";

export default async function ProgressPage() {
  const learners = await prisma.learner.findMany({
    where: { status: { in: ["IN_LEARNING", "ENROLLED", "GATEWAY", "EPA", "BREAK_IN_LEARNING", "AT_RISK"] } },
    include: {
      programme: true,
      organisation: true,
      progress: { orderBy: { occurredAt: "desc" }, take: 1 },
    },
    orderBy: { lastName: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Programme progress"
        description="Off-the-job hours, reviews and milestones across the funded apprenticeship. Shortfalls raise anomalies automatically."
      />
      <Card>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-tid-line text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="py-2 pr-3">Learner</th>
              <th className="py-2 pr-3">Standard</th>
              <th className="py-2 pr-3">OTJ</th>
              <th className="py-2 pr-3">Last activity</th>
              <th className="py-2 pr-3">Line manager</th>
            </tr>
          </thead>
          <tbody>
            {learners.map((l) => {
              const pct = otjPercent(l);
              return (
                <tr key={l.id} className="border-b border-tid-line/60">
                  <td className="py-3 pr-3">
                    <Link href={`/learners/${l.id}`} className="font-medium text-tid-navy hover:underline">
                      {fullName(l)}
                    </Link>
                    <div className="text-xs text-neutral-500">{l.organisation.legalName}</div>
                  </td>
                  <td className="py-3 pr-3">{l.programme?.name ?? "—"}</td>
                  <td className="py-3 pr-3">
                    <div className="mb-1 h-2 w-32 overflow-hidden rounded-full bg-tid-line">
                      <div className="h-full bg-tid-navy" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs">
                      {l.otjHoursLogged}/{l.otjHoursRequired}h
                    </span>
                    {pct < 50 ? (
                      <Badge tone="amber">Behind</Badge>
                    ) : (
                      <Badge tone="green">On track</Badge>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    {l.progress[0] ? (
                      <>
                        {l.progress[0].title}
                        <div className="text-xs text-neutral-500">{formatDate(l.progress[0].occurredAt)}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3 pr-3">{l.lineManagerName}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
