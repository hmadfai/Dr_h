import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Stat } from "@/components/ui";
import { PIPELINE_STAGES, labelOf } from "@/lib/constants";

export default async function ReportsPage() {
  const [byStage, byStatus, anomalies, dropouts, consentsGiven, removals] = await Promise.all([
    prisma.learner.groupBy({ by: ["pipelineStage"], _count: { _all: true } }),
    prisma.learner.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.anomaly.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.dropoutCase.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.consentRecord.count({ where: { given: true, withdrawnAt: null } }),
    prisma.removalRecord.count(),
  ]);
  const total = byStatus.reduce((sum, row) => sum + row._count._all, 0);

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Operational view of recruitment, on-programme quality and GDPR posture. Export individual files from each learner record or via a SAR."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="People on file" value={total} />
        <Stat label="Live consents" value={consentsGiven} />
        <Stat label="Removal register" value={removals} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Pipeline</h2>
          <ul className="space-y-2 text-sm">
            {PIPELINE_STAGES.map((s) => {
              const row = byStage.find((r) => r.pipelineStage === s.value);
              return (
                <li key={s.value} className="flex justify-between">
                  <span>{s.label}</span>
                  <span className="font-medium">{row?._count._all ?? 0}</span>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Learner status</h2>
          <ul className="space-y-2 text-sm">
            {byStatus.map((r) => (
              <li key={r.status} className="flex justify-between">
                <span>{r.status.replaceAll("_", " ")}</span>
                <span className="font-medium">{r._count._all}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Anomalies by type</h2>
          <ul className="space-y-2 text-sm">
            {anomalies.map((r) => (
              <li key={r.type} className="flex justify-between">
                <span>{r.type.replaceAll("_", " ")}</span>
                <span className="font-medium">{r._count._all}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Dropout cases</h2>
          <ul className="space-y-2 text-sm">
            {dropouts.map((r) => (
              <li key={r.status} className="flex justify-between">
                <span>{labelOf([{ value: r.status, label: r.status }], r.status).replaceAll("_", " ")}</span>
                <span className="font-medium">{r._count._all}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
