import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, statusTone, Field, SelectField, TextArea, Check } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import {
  addConsentAction,
  createGdprRequestAction,
  processErasureAction,
  updateGdprRequestAction,
  withdrawConsentAction,
} from "@/app/actions";
import {
  CONSENT_PURPOSES,
  GDPR_REQUEST_TYPES,
  GDPR_STATUSES,
  LAWFUL_BASES,
  REMOVAL_STATUSES,
  labelOf,
} from "@/lib/constants";
import { formatDate, daysUntil } from "@/lib/format";
import { decrypt } from "@/lib/crypto";
import Link from "next/link";

export default async function GdprPage() {
  const [consents, requests, removals, learners] = await Promise.all([
    prisma.consentRecord.findMany({ orderBy: { givenAt: "desc" }, take: 80 }),
    prisma.gdprRequest.findMany({ orderBy: { receivedAt: "desc" } }),
    prisma.removalRecord.findMany({ orderBy: { requestedAt: "desc" } }),
    prisma.learner.findMany({ where: { status: { not: "ERASED" } }, orderBy: { lastName: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="UK GDPR"
        description="Consent register, data-subject rights (including the one-month SAR clock), and a removal register for people who must not be re-imported."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Record consent</h2>
          <ActionForm action={addConsentAction} submitLabel="Record consent" className="space-y-3">
            <SelectField
              label="Linked learner (optional)"
              name="learnerId"
              options={learners.map((l) => ({ value: l.id, label: `${l.firstName} ${l.lastName}` }))}
            />
            <SelectField
              label="Subject type"
              name="subjectType"
              required
              options={[
                { value: "LEARNER", label: "Learner / prospect" },
                { value: "LINE_MANAGER", label: "Line manager" },
                { value: "DAS_HOLDER", label: "DAS account holder" },
              ]}
              defaultValue="LEARNER"
            />
            <Field label="Full name" name="subjectName" required />
            <Field label="Email" name="email" type="email" required hint="Stored as HMAC only on the consent row" />
            <SelectField
              label="Purpose"
              name="purpose"
              required
              options={CONSENT_PURPOSES.map((p) => ({ value: p.value, label: p.label }))}
            />
            <SelectField label="Lawful basis" name="lawfulBasis" required options={LAWFUL_BASES} />
            <Field label="Method" name="method" defaultValue="CRM_FORM" />
            <Check name="given" defaultChecked label="Consent / acknowledgement given" />
            <Field label="Evidence (e.g. form ref, email date)" name="evidence" />
          </ActionForm>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Log a rights request</h2>
          <ActionForm action={createGdprRequestAction} submitLabel="Log request" className="space-y-3">
            <SelectField label="Type" name="type" required options={GDPR_REQUEST_TYPES} />
            <Field label="Subject name" name="subjectName" required />
            <Field label="Subject email" name="subjectEmail" type="email" required />
            <TextArea label="Notes" name="notes" />
          </ActionForm>
          <p className="mt-3 text-xs text-neutral-500">
            Erasure requests are also added to the removal register immediately so recruitment cannot re-add the person while
            the request is open.
          </p>
        </Card>
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 font-semibold">Consent register</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-tid-line text-xs uppercase text-neutral-500">
              <tr>
                <th className="py-2 pr-3">Person</th>
                <th className="py-2 pr-3">Purpose</th>
                <th className="py-2 pr-3">Basis</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Notice</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {consents.map((c) => (
                <tr key={c.id} className="border-b border-tid-line/60">
                  <td className="py-2 pr-3">
                    {c.subjectName}
                    <div className="text-xs text-neutral-500">{c.subjectType}</div>
                  </td>
                  <td className="py-2 pr-3">{labelOf(CONSENT_PURPOSES, c.purpose)}</td>
                  <td className="py-2 pr-3">{c.lawfulBasis}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={c.given ? "green" : "red"}>{c.given ? "Given" : "Withdrawn"}</Badge>
                    <div className="text-xs text-neutral-500">{formatDate(c.givenAt)}</div>
                  </td>
                  <td className="py-2 pr-3 text-xs">{c.privacyNoticeVersion}</td>
                  <td className="py-2 pr-3">
                    {c.given ? (
                      <form action={withdrawConsentAction}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="text-xs text-tid-accent hover:underline">Withdraw</button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="mb-3 font-semibold">Data-subject requests (30-day clock)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-tid-line text-xs uppercase text-neutral-500">
              <tr>
                <th className="py-2 pr-3">Reference</th>
                <th className="py-2 pr-3">Person</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Due</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const due = daysUntil(r.dueAt);
                return (
                  <tr key={r.id} className="border-b border-tid-line/60 align-top">
                    <td className="py-2 pr-3 font-mono text-xs">{r.reference}</td>
                    <td className="py-2 pr-3">
                      {r.subjectName}
                      <div className="text-xs text-neutral-500">{decrypt(r.subjectEmail)}</div>
                      {r.learnerId ? (
                        <Link href={`/learners/${r.learnerId}`} className="text-xs text-tid-accent hover:underline">
                          Learner file
                        </Link>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{labelOf(GDPR_REQUEST_TYPES, r.type)}</td>
                    <td className="py-2 pr-3">
                      {formatDate(r.dueAt)}
                      {due != null && r.status !== "COMPLETED" && r.status !== "REJECTED" && r.status !== "LEGALLY_RETAINED" ? (
                        <div className={due < 7 ? "text-xs text-red-700" : "text-xs text-neutral-500"}>
                          {due >= 0 ? `${due} days left` : `${Math.abs(due)} days overdue`}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge tone={statusTone(r.status)}>{labelOf(GDPR_STATUSES, r.status)}</Badge>
                    </td>
                    <td className="py-2 pr-3">
                      <form action={updateGdprRequestAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <select name="status" defaultValue={r.status} className="rounded border border-tid-line px-2 py-1 text-xs">
                          {GDPR_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" name="identityVerified" defaultChecked={r.identityVerified} /> ID verified
                        </label>
                        <button className="text-xs text-tid-accent">Save</button>
                      </form>
                      {r.type === "ERASURE" && !["COMPLETED", "LEGALLY_RETAINED"].includes(r.status) ? (
                        <form action={processErasureAction} className="mt-2">
                          <input type="hidden" name="id" value={r.id} />
                          <button className="rounded bg-red-700 px-2 py-1 text-xs text-white">Process erasure / anonymise</button>
                        </form>
                      ) : null}
                      {r.outcome ? <p className="mt-2 max-w-xs text-xs text-neutral-500">{r.outcome}</p> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="mb-3 font-semibold">People requiring removal</h2>
        <p className="mb-3 text-sm text-neutral-600">
          This register retains a hashed email and outcome only, so Training in Data can honour erasure and block
          re-enrolment. Direct identifiers are overwritten when the request is processed.
        </p>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-tid-line text-xs uppercase text-neutral-500">
            <tr>
              <th className="py-2 pr-3">Requested</th>
              <th className="py-2 pr-3">Snapshot name</th>
              <th className="py-2 pr-3">Email hash (suppression)</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2 pr-3">Retention note</th>
            </tr>
          </thead>
          <tbody>
            {removals.map((r) => (
              <tr key={r.id} className="border-b border-tid-line/60">
                <td className="py-2 pr-3">{formatDate(r.requestedAt)}</td>
                <td className="py-2 pr-3">{r.subjectNameSnapshot}</td>
                <td className="py-2 pr-3 font-mono text-[10px]">{r.subjectEmailHash.slice(0, 16)}…</td>
                <td className="py-2 pr-3">
                  <Badge tone={statusTone(r.status)}>{labelOf(REMOVAL_STATUSES, r.status)}</Badge>
                </td>
                <td className="py-2 pr-3 text-xs text-neutral-600">{r.legalRetentionNote ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
