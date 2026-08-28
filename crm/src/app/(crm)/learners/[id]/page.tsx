import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, statusTone, Button, Field, SelectField, TextArea } from "@/components/ui";
import { LearnerForm } from "@/components/learner-form";
import { ActionForm } from "@/components/action-form";
import {
  addAnomalyAction,
  addNoteAction,
  addProgressAction,
  createDropoutAction,
  sendTemplatedEmailAction,
} from "@/app/actions";
import { revealLearner, revealOrganisation, fullName, formatDate, otjPercent } from "@/lib/format";
import {
  ANOMALY_TYPES,
  DROPOUT_STATUSES,
  ILR_WITHDRAWAL_REASONS,
  LEARNER_STATUSES,
  PROGRESS_TYPES,
  SEVERITIES,
  labelOf,
} from "@/lib/constants";
import { decryptEmail } from "@/lib/email";
import Link from "next/link";

function isoDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export default async function LearnerDetailPage({ params }: { params: { id: string } }) {
  const learner = await prisma.learner.findUnique({
    where: { id: params.id },
    include: {
      organisation: true,
      programme: true,
      progress: { orderBy: { occurredAt: "desc" } },
      anomalies: { orderBy: { detectedAt: "desc" } },
      dropouts: { orderBy: { createdAt: "desc" }, include: { activities: { orderBy: { occurredAt: "desc" } } } },
      consents: { orderBy: { givenAt: "desc" } },
      notes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!learner) notFound();
  const revealed = revealLearner(learner);
  const org = revealOrganisation(learner.organisation);
  const [templates, emails] = await Promise.all([
    prisma.emailTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.emailMessage.findMany({
      where: { relatedType: "Learner", relatedId: learner.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title={fullName(learner)}
        description={`${learner.reference} · ${learner.organisation.legalName} · LM ${learner.lineManagerName}`}
        actions={
          <>
            <Button href={`/api/gdpr/export/${learner.id}`} variant="secondary">
              GDPR export
            </Button>
            <Button href="/email" variant="secondary">
              Email workspace
            </Button>
            <Button href={`/dropouts`} variant="secondary">
              Dropout cases
            </Button>
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-xs uppercase text-neutral-500">Status</p>
          <div className="mt-2">
            <Badge tone={statusTone(learner.status)}>{labelOf(LEARNER_STATUSES, learner.status)}</Badge>
          </div>
        </Card>
        <Card>
          <p className="text-xs uppercase text-neutral-500">OTJ hours</p>
          <p className="mt-2 text-2xl font-semibold text-tid-navy">
            {learner.otjHoursLogged}/{learner.otjHoursRequired || 0}
          </p>
          <p className="text-xs text-neutral-500">{otjPercent(learner)}% of target</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-neutral-500">Programme</p>
          <p className="mt-2 text-sm font-medium">{learner.programme?.name ?? "Not assigned"}</p>
          <p className="text-xs text-neutral-500">{learner.programme?.standardCode}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase text-neutral-500">DAS holder</p>
          <p className="mt-2 text-sm font-medium">{org.dasHolderName}</p>
          <p className="text-xs text-neutral-500">{org.dasHolderEmail}</p>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <LearnerForm
            learner={{
              ...revealed,
              startDate: isoDate(learner.startDate),
              plannedEndDate: isoDate(learner.plannedEndDate),
              organisationId: learner.organisationId,
              programmeId: learner.programmeId,
            }}
            organisations={await prisma.organisation.findMany({ orderBy: { legalName: "asc" } })}
            programmes={await prisma.programme.findMany({ orderBy: { name: "asc" } })}
          />
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 font-semibold">Record progress</h2>
            <ActionForm action={addProgressAction} submitLabel="Add progress" className="space-y-3">
              <input type="hidden" name="learnerId" value={learner.id} />
              <SelectField label="Type" name="type" required options={PROGRESS_TYPES} />
              <Field label="Title" name="title" required />
              <Field label="Date" name="occurredAt" type="date" required defaultValue={isoDate(new Date())} />
              <Field label="Hours (OTJ)" name="hours" type="number" />
              <Field label="Percent complete" name="percent" type="number" />
              <TextArea label="Details" name="details" rows={3} />
            </ActionForm>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Record anomaly</h2>
            <ActionForm action={addAnomalyAction} submitLabel="Log anomaly" className="space-y-3">
              <input type="hidden" name="learnerId" value={learner.id} />
              <SelectField label="Type" name="type" required options={ANOMALY_TYPES} />
              <SelectField label="Severity" name="severity" required options={SEVERITIES} defaultValue="MEDIUM" />
              <Field label="Title" name="title" required />
              <TextArea label="Description" name="description" required rows={3} />
            </ActionForm>
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Open dropout / at-risk case</h2>
            <ActionForm action={createDropoutAction} submitLabel="Open case" className="space-y-3">
              <input type="hidden" name="learnerId" value={learner.id} />
              <SelectField label="Status" name="status" required options={DROPOUT_STATUSES} defaultValue="AT_RISK" />
              <SelectField label="ILR withdrawal reason" name="ilrReasonCode" options={ILR_WITHDRAWAL_REASONS} />
              <TextArea label="Why are they at risk / leaving?" name="reasonDetail" required rows={3} />
            </ActionForm>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Progress timeline</h2>
          <ul className="space-y-3 text-sm">
            {learner.progress.map((p) => (
              <li key={p.id} className="border-b border-tid-line/70 pb-2">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{p.title}</span>
                  <span className="text-xs text-neutral-500">{formatDate(p.occurredAt)}</span>
                </div>
                <p className="text-neutral-600">
                  {p.type}
                  {p.hours != null ? ` · ${p.hours}h` : ""}
                  {p.percent != null ? ` · ${p.percent}%` : ""}
                </p>
                {p.details ? <p className="text-neutral-500">{p.details}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Anomalies</h2>
          <ul className="space-y-3 text-sm">
            {learner.anomalies.map((a) => (
              <li key={a.id} className="border-b border-tid-line/70 pb-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{a.title}</span>
                  <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                </div>
                <p className="text-neutral-600">{a.description}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Consent register</h2>
          <ul className="space-y-2 text-sm">
            {learner.consents.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span>
                  {c.subjectType}: {c.purpose.replaceAll("_", " ")}
                </span>
                <Badge tone={c.given ? "green" : "red"}>{c.given ? "Given" : "Withdrawn"}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Email this person</h2>
          <ActionForm action={sendTemplatedEmailAction} submitLabel="Send / queue email" className="space-y-3">
            <input type="hidden" name="relatedType" value="Learner" />
            <input type="hidden" name="relatedId" value={learner.id} />
            <input type="hidden" name="var_firstName" value={learner.firstName} />
            <input type="hidden" name="var_lastName" value={learner.lastName} />
            <input type="hidden" name="var_lineManagerName" value={learner.lineManagerName} />
            <input type="hidden" name="var_organisation" value={learner.organisation.legalName} />
            <input type="hidden" name="var_programme" value={learner.programme?.name ?? ""} />
            <input type="hidden" name="var_reference" value={learner.reference} />
            <SelectField
              label="Template"
              name="templateId"
              options={templates.map((t) => ({ value: t.id, label: t.name }))}
            />
            <Field label="To" name="to" type="email" required defaultValue={revealed.email} />
            <Field label="Cc line manager" name="cc" type="email" defaultValue={revealed.lineManagerEmail} />
            <Field label="Subject override" name="subject" />
            <TextArea label="Body override (leave blank to use template)" name="body" rows={5} />
          </ActionForm>
          <ul className="mt-4 space-y-2 text-xs text-neutral-600">
            {emails.map((m) => {
              const d = decryptEmail(m);
              return (
                <li key={m.id}>
                  {m.status} · {d.subject} · {formatDate(m.sentAt ?? m.createdAt)}
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Dropout cases</h2>
          {learner.dropouts.length === 0 ? (
            <p className="text-sm text-neutral-500">No dropout or at-risk case yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {learner.dropouts.map((d) => (
                <li key={d.id}>
                  <Link href={`/dropouts/${d.id}`} className="text-tid-navy hover:underline">
                    {d.status.replaceAll("_", " ")}
                  </Link>
                  <span className="text-neutral-500"> · {d.activities.length} re-engagement activities</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Notes</h2>
          <ActionForm action={addNoteAction} submitLabel="Add note" className="space-y-3">
            <input type="hidden" name="relatedType" value="Learner" />
            <input type="hidden" name="relatedId" value={learner.id} />
            <TextArea label="Note" name="body" required rows={3} />
          </ActionForm>
          <ul className="mt-4 space-y-2 text-sm text-neutral-600">
            {learner.notes.map((n) => (
              <li key={n.id}>
                {formatDate(n.createdAt)} — {n.body}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
