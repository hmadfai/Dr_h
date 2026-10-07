import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, statusTone, SelectField, TextArea } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { addAnomalyAction, updateAnomalyAction } from "@/app/actions";
import { ANOMALY_STATUSES, ANOMALY_TYPES, SEVERITIES, labelOf } from "@/lib/constants";
import { fullName, formatDate } from "@/lib/format";
import Link from "next/link";

export default async function AnomaliesPage() {
  const [anomalies, learners] = await Promise.all([
    prisma.anomaly.findMany({
      include: { learner: true },
      orderBy: { detectedAt: "desc" },
    }),
    prisma.learner.findMany({
      where: { status: { not: "ERASED" } },
      orderBy: { lastName: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Anomalies"
        description="Anything that could affect funding, quality or learner welfare: OTJ shortfall, missed reviews, DAS issues, safeguarding and data quality."
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-tid-line text-xs uppercase text-neutral-500">
              <tr>
                <th className="py-2 pr-3">Anomaly</th>
                <th className="py-2 pr-3">Learner</th>
                <th className="py-2 pr-3">Severity</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.map((a) => (
                <tr key={a.id} className="border-b border-tid-line/60 align-top">
                  <td className="py-3 pr-3">
                    <div className="font-medium">{a.title}</div>
                    <div className="text-xs text-neutral-500">
                      {labelOf(ANOMALY_TYPES, a.type)} · {formatDate(a.detectedAt)}
                    </div>
                    <p className="mt-1 text-neutral-600">{a.description}</p>
                    <form action={updateAnomalyAction} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={a.id} />
                      <select name="status" defaultValue={a.status} className="rounded border border-tid-line px-2 py-1 text-xs">
                        {ANOMALY_STATUSES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <input name="resolution" placeholder="Resolution note" defaultValue={a.resolution ?? ""} className="rounded border border-tid-line px-2 py-1 text-xs" />
                      <button type="submit" className="text-xs font-medium text-tid-accent">
                        Update
                      </button>
                    </form>
                  </td>
                  <td className="py-3 pr-3">
                    <Link href={`/learners/${a.learnerId}`} className="text-tid-navy hover:underline">
                      {fullName(a.learner)}
                    </Link>
                  </td>
                  <td className="py-3 pr-3">
                    <Badge tone={a.severity === "CRITICAL" || a.severity === "HIGH" ? "red" : "amber"}>{a.severity}</Badge>
                  </td>
                  <td className="py-3 pr-3">
                    <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Log anomaly</h2>
          <ActionForm action={addAnomalyAction} submitLabel="Create" className="space-y-3">
            <SelectField
              label="Learner"
              name="learnerId"
              required
              options={learners.map((l) => ({ value: l.id, label: `${fullName(l)} (${l.reference})` }))}
            />
            <SelectField label="Type" name="type" required options={ANOMALY_TYPES} />
            <SelectField label="Severity" name="severity" required options={SEVERITIES} defaultValue="MEDIUM" />
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Title</span>
              <input name="title" required className="w-full rounded-lg border border-tid-line px-3 py-2 text-sm" />
            </label>
            <TextArea label="Description" name="description" required />
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
