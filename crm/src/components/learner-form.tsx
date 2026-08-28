import { ActionForm } from "@/components/action-form";
import { Card, Check, Field, SelectField } from "@/components/ui";
import { createLearnerAction, updateLearnerAction } from "@/app/actions";
import { LEARNER_STATUSES, PIPELINE_STAGES } from "@/lib/constants";

export function LearnerForm({
  learner,
  organisations,
  programmes,
  defaultOrganisationId,
}: {
  learner?: Record<string, unknown>;
  organisations: { id: string; legalName: string }[];
  programmes: { id: string; name: string; standardCode: string }[];
  defaultOrganisationId?: string;
}) {
  const v = (key: string) => (learner ? String(learner[key] ?? "") : "");
  return (
    <ActionForm
      action={learner ? updateLearnerAction : createLearnerAction}
      submitLabel={learner ? "Save learner" : "Create prospect"}
      className="space-y-6"
    >
      {learner ? <input type="hidden" name="id" value={v("id")} /> : null}
      <Card>
        <h2 className="mb-4 font-semibold">Person</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" name="firstName" required defaultValue={v("firstName")} />
          <Field label="Last name" name="lastName" required defaultValue={v("lastName")} />
          <Field label="Preferred name" name="preferredName" defaultValue={v("preferredName")} />
          <Field label="Email" name="email" type="email" required defaultValue={v("email")} hint="Encrypted at rest" />
          <Field label="Phone" name="phone" defaultValue={v("phone")} />
          <Field label="Date of birth" name="dateOfBirth" type="date" defaultValue={v("dateOfBirth")} />
          <Field label="National Insurance number" name="nationalInsurance" defaultValue={v("nationalInsurance")} hint="Encrypted" />
          <Field label="ULN" name="uln" defaultValue={v("uln")} hint="Unique Learner Number, encrypted" />
          <Field label="Address line 1" name="addressLine1" defaultValue={v("addressLine1")} />
          <Field label="City" name="city" defaultValue={v("city")} />
          <Field label="Postcode" name="postcode" defaultValue={v("postcode")} />
          <Field label="Job title" name="jobTitle" defaultValue={v("jobTitle")} />
        </div>
      </Card>
      <Card>
        <h2 className="mb-4 font-semibold">Employer & programme</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Organisation"
            name="organisationId"
            required
            defaultValue={v("organisationId") || defaultOrganisationId}
            options={organisations.map((o) => ({ value: o.id, label: o.legalName }))}
          />
          <SelectField
            label="Apprenticeship standard"
            name="programmeId"
            defaultValue={v("programmeId")}
            options={programmes.map((p) => ({ value: p.id, label: `${p.name} (${p.standardCode})` }))}
          />
          <SelectField label="Pipeline stage" name="pipelineStage" required options={PIPELINE_STAGES} defaultValue={v("pipelineStage") || "ENQUIRY"} />
          <SelectField label="Status" name="status" required options={LEARNER_STATUSES} defaultValue={v("status") || "PROSPECT"} />
          <Field label="Start date" name="startDate" type="date" defaultValue={v("startDate")} />
          <Field label="Planned end date" name="plannedEndDate" type="date" defaultValue={v("plannedEndDate")} />
          <Field label="OTJ hours required" name="otjHoursRequired" type="number" defaultValue={v("otjHoursRequired")} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Check name="rightToWorkChecked" label="Right to work in the UK checked" defaultChecked={Boolean(learner?.rightToWorkChecked)} />
          <Check name="residencyEligible" label="Residency / funding eligibility confirmed" defaultChecked={Boolean(learner?.residencyEligible)} />
        </div>
      </Card>
      <Card className="border-tid-navy/30">
        <h2 className="mb-1 font-semibold">Workplace line manager (required)</h2>
        <p className="mb-4 text-sm text-neutral-600">
          UK apprenticeship funding rules require a workplace line manager who supports off-the-job training and progress
          reviews. This cannot be skipped for a prospect.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Line manager name" name="lineManagerName" required defaultValue={v("lineManagerName")} />
          <Field label="Job title" name="lineManagerJobTitle" required defaultValue={v("lineManagerJobTitle")} />
          <Field label="Work email" name="lineManagerEmail" type="email" required defaultValue={v("lineManagerEmail")} />
          <Field label="Phone" name="lineManagerPhone" required defaultValue={v("lineManagerPhone")} />
        </div>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">People consent (UK GDPR)</h2>
        <div className="space-y-3">
          <Check
            name="privacyNotice"
            required={!learner}
            defaultChecked
            label={`Privacy notice ${learner ? "already recorded — tick to confirm it remains valid" : "acknowledged (Training in Data TiD-PP-2026-08-19). Required before the record is created."}`}
          />
          <Check name="marketingConsent" label="Optional: consent to marketing about Training in Data programmes" defaultChecked={false} />
        </div>
      </Card>
    </ActionForm>
  );
}
