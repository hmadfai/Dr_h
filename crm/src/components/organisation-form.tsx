import { ActionForm } from "@/components/action-form";
import { Card, Check, Field, PageHeader, SelectField, TextArea } from "@/components/ui";
import { createOrganisationAction, updateOrganisationAction } from "@/app/actions";
import { LEVY_STATUSES } from "@/lib/constants";

export function OrganisationForm({
  org,
}: {
  org?: {
    id: string;
    legalName: string;
    tradingName: string | null;
    companiesHouseNo: string | null;
    addressLine1: string;
    city: string;
    postcode: string;
    sector: string | null;
    employeeCount: number | null;
    levyStatus: string;
    dasAccountId: string;
    dasHolderName: string;
    dasHolderJobTitle: string;
    dasHolderEmail: string;
    dasHolderPhone: string;
    notes: string | null;
  };
}) {
  return (
    <ActionForm
      action={org ? updateOrganisationAction : createOrganisationAction}
      submitLabel={org ? "Save organisation" : "Create organisation"}
      className="space-y-6"
    >
      {org ? <input type="hidden" name="id" value={org.id} /> : null}
      <Card>
        <h2 className="mb-4 font-semibold">Employer</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Legal name" name="legalName" required defaultValue={org?.legalName} />
          <Field label="Trading name" name="tradingName" defaultValue={org?.tradingName} />
          <Field label="Companies House number" name="companiesHouseNo" defaultValue={org?.companiesHouseNo} />
          <Field label="Sector" name="sector" defaultValue={org?.sector} />
          <Field label="Address line 1" name="addressLine1" required defaultValue={org?.addressLine1} hint="Stored encrypted" />
          <Field label="City" name="city" required defaultValue={org?.city} />
          <Field label="Postcode" name="postcode" required defaultValue={org?.postcode} hint="Stored encrypted" />
          <Field label="Employee count" name="employeeCount" type="number" defaultValue={org?.employeeCount} />
          <SelectField label="Levy status" name="levyStatus" required options={LEVY_STATUSES} defaultValue={org?.levyStatus} />
        </div>
      </Card>
      <Card className="border-tid-navy/30">
        <h2 className="mb-1 font-semibold">DAS account holder (required)</h2>
        <p className="mb-4 text-sm text-neutral-600">
          The Digital Apprenticeship Service account holder is the person who creates reservations, confirms the
          apprenticeship and authorises levy / government co-investment funding.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="DAS account ID" name="dasAccountId" required defaultValue={org?.dasAccountId} hint="Encrypted at rest" />
          <Field label="Account holder name" name="dasHolderName" required defaultValue={org?.dasHolderName} />
          <Field label="Job title" name="dasHolderJobTitle" required defaultValue={org?.dasHolderJobTitle} />
          <Field label="Work email" name="dasHolderEmail" type="email" required defaultValue={org?.dasHolderEmail} />
          <Field label="Phone" name="dasHolderPhone" required defaultValue={org?.dasHolderPhone} />
        </div>
      </Card>
      <Card>
        <TextArea label="Internal notes" name="notes" defaultValue={org?.notes} />
        {!org ? (
          <div className="mt-4">
            <Check
              name="privacyNotice"
              defaultChecked
              label="I confirm the DAS account holder has been given the Training in Data privacy notice and we have a lawful basis to hold their details for apprenticeship funding."
            />
          </div>
        ) : null}
      </Card>
    </ActionForm>
  );
}
