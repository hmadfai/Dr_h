import { prisma } from "@/lib/prisma";
import { PageHeader, Stat, Card, Badge, statusTone, Button } from "@/components/ui";
import { DROPOUT_STATUSES, LEARNER_STATUSES, labelOf } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import Link from "next/link";

export default async function DashboardPage() {
  const [
    learners,
    orgs,
    inLearning,
    atRisk,
    openAnomalies,
    openDropouts,
    dueGdpr,
    openTasks,
    recentProgress,
    recentDropouts,
  ] = await Promise.all([
    prisma.learner.count({ where: { status: { not: "ERASED" } } }),
    prisma.organisation.count(),
    prisma.learner.count({ where: { status: { in: ["IN_LEARNING", "ENROLLED", "GATEWAY", "EPA"] } } }),
    prisma.learner.count({ where: { status: "AT_RISK" } }),
    prisma.anomaly.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
    prisma.dropoutCase.count({ where: { status: { in: ["AT_RISK", "WITHDRAWN"] } } }),
    prisma.gdprRequest.count({ where: { status: { in: ["RECEIVED", "ID_VERIFIED", "IN_PROGRESS"] } } }),
    prisma.task.count({ where: { status: "OPEN" } }),
    prisma.progressEntry.findMany({
      take: 6,
      orderBy: { occurredAt: "desc" },
      include: { learner: true },
    }),
    prisma.dropoutCase.findMany({
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: { learner: true, activities: { orderBy: { occurredAt: "desc" }, take: 1 } },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Apprenticeship operations"
        description="Recruitment through to funded delivery for Training in Data — DAS employers, line managers, progress, anomalies and GDPR in one place."
        actions={<Button href="/learners/new">New prospect</Button>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active people" value={learners} hint={`${orgs} employer organisations`} />
        <Stat label="In learning" value={inLearning} hint={`${atRisk} at risk of dropout`} />
        <Stat label="Open anomalies" value={openAnomalies} hint="OTJ, reviews, funding, safeguarding" />
        <Stat label="Rights requests due" value={dueGdpr} hint={`${openTasks} open tasks · ${openDropouts} live dropout cases`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-tid-ink">Recent progress</h2>
            <Link href="/progress" className="text-sm text-tid-accent hover:underline">
              View all
            </Link>
          </div>
          <ul className="space-y-3 text-sm">
            {recentProgress.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 border-b border-tid-line/70 pb-3 last:border-0">
                <div>
                  <Link href={`/learners/${row.learnerId}`} className="font-medium text-tid-navy hover:underline">
                    {row.learner.firstName} {row.learner.lastName}
                  </Link>
                  <p className="text-neutral-600">
                    {row.title} · {row.type}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-neutral-500">{formatDate(row.occurredAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-tid-ink">Dropout & re-engagement</h2>
            <Link href="/dropouts" className="text-sm text-tid-accent hover:underline">
              Manage
            </Link>
          </div>
          <ul className="space-y-3 text-sm">
            {recentDropouts.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 border-b border-tid-line/70 pb-3 last:border-0">
                <div>
                  <Link href={`/dropouts/${row.id}`} className="font-medium text-tid-navy hover:underline">
                    {row.learner.firstName} {row.learner.lastName}
                  </Link>
                  <p className="text-neutral-600">
                    {row.reasonDetail}
                    {row.activities[0] ? ` · last: ${row.activities[0].outcome.replaceAll("_", " ").toLowerCase()}` : ""}
                  </p>
                </div>
                <Badge tone={statusTone(row.status)}>{labelOf(DROPOUT_STATUSES, row.status)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="mt-6">
        <h2 className="mb-2 font-semibold">UK funded apprenticeship checklist</h2>
        <p className="text-sm text-neutral-600">
          Every prospect needs a workplace line manager. Every employer needs a DAS account holder. Eligibility, OTJ hours
          and progress reviews are tracked here. Consent and erasure sit under GDPR. Statuses:{" "}
          {LEARNER_STATUSES.map((s) => s.label).join(" · ")}
        </p>
      </Card>
    </div>
  );
}
