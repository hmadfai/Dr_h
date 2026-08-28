import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, statusTone, SelectField, TextArea, Field } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { addReengagementAction, sendTemplatedEmailAction } from "@/app/actions";
import { DROPOUT_STATUSES, REENGAGEMENT_OUTCOMES, REENGAGEMENT_TYPES, labelOf } from "@/lib/constants";
import { fullName, formatDateTime, revealLearner } from "@/lib/format";
import Link from "next/link";

export default async function DropoutDetailPage({ params }: { params: { id: string } }) {
  const dropout = await prisma.dropoutCase.findUnique({
    where: { id: params.id },
    include: {
      learner: { include: { organisation: true, programme: true } },
      activities: { orderBy: { occurredAt: "desc" } },
    },
  });
  if (!dropout) notFound();
  const learner = revealLearner(dropout.learner);
  const templates = await prisma.emailTemplate.findMany({
    where: { category: { in: ["REENGAGEMENT", "DROPOUT", "GENERAL"] }, active: true },
  });
  const allTemplates = templates.length
    ? templates
    : await prisma.emailTemplate.findMany({ where: { active: true } });

  return (
    <div>
      <PageHeader
        title={`Bring back: ${fullName(dropout.learner)}`}
        description={dropout.reasonDetail}
        actions={
          <Link href={`/learners/${dropout.learnerId}`} className="text-sm font-medium text-tid-accent hover:underline">
            Open learner file
          </Link>
        }
      />
      <div className="mb-4">
        <Badge tone={statusTone(dropout.status)}>{labelOf(DROPOUT_STATUSES, dropout.status)}</Badge>
        {dropout.ilrReasonCode ? <span className="ml-2 text-sm text-neutral-600">ILR reason {dropout.ilrReasonCode}</span> : null}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Log re-engagement activity</h2>
          <ActionForm action={addReengagementAction} submitLabel="Log activity" className="space-y-3">
            <input type="hidden" name="dropoutCaseId" value={dropout.id} />
            <SelectField label="Activity" name="type" required options={REENGAGEMENT_TYPES} />
            <SelectField label="Outcome" name="outcome" required options={REENGAGEMENT_OUTCOMES} />
            <TextArea label="What happened?" name="summary" required />
          </ActionForm>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Re-engagement email</h2>
          <ActionForm action={sendTemplatedEmailAction} submitLabel="Send re-engagement email" className="space-y-3">
            <input type="hidden" name="relatedType" value="DropoutCase" />
            <input type="hidden" name="relatedId" value={dropout.id} />
            <input type="hidden" name="var_firstName" value={dropout.learner.firstName} />
            <input type="hidden" name="var_lineManagerName" value={dropout.learner.lineManagerName} />
            <input type="hidden" name="var_organisation" value={dropout.learner.organisation.legalName} />
            <SelectField
              label="Template"
              name="templateId"
              options={allTemplates.map((t) => ({ value: t.id, label: t.name }))}
            />
            <Field label="To" name="to" type="email" required defaultValue={learner.email} />
            <Field label="Cc line manager" name="cc" defaultValue={learner.lineManagerEmail} />
            <TextArea label="Personalised body (optional override)" name="body" rows={6} />
          </ActionForm>
        </Card>
      </div>
      <Card className="mt-6">
        <h2 className="mb-3 font-semibold">Activity log</h2>
        <ol className="space-y-4">
          {dropout.activities.map((a) => (
            <li key={a.id} className="border-l-2 border-tid-navy pl-4">
              <div className="text-sm font-medium">
                {labelOf(REENGAGEMENT_TYPES, a.type)} · {labelOf(REENGAGEMENT_OUTCOMES, a.outcome)}
              </div>
              <p className="text-sm text-neutral-600">{a.summary}</p>
              <p className="text-xs text-neutral-500">{formatDateTime(a.occurredAt)}</p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
