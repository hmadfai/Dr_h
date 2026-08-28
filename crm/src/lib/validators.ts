export type FieldErrors = Record<string, string>;

export function required(value: FormDataEntryValue | null, field: string, errors: FieldErrors) {
  const text = String(value ?? "").trim();
  if (!text) errors[field] = "This field is required.";
  return text;
}

export function emailField(value: FormDataEntryValue | null, field: string, errors: FieldErrors) {
  const text = required(value, field, errors);
  if (text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    errors[field] = "Enter a valid email address.";
  }
  return text;
}

export function optional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || "";
}

export function intField(value: FormDataEntryValue | null, field: string, errors: FieldErrors, opts?: { min?: number; required?: boolean }) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    if (opts?.required) errors[field] = "This field is required.";
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    errors[field] = "Enter a whole number.";
    return null;
  }
  if (opts?.min != null && n < opts.min) {
    errors[field] = `Must be at least ${opts.min}.`;
  }
  return n;
}

export type OrganisationInput = {
  legalName: string;
  tradingName: string;
  companiesHouseNo: string;
  addressLine1: string;
  city: string;
  postcode: string;
  sector: string;
  employeeCount: number | null;
  levyStatus: string;
  dasAccountId: string;
  dasHolderName: string;
  dasHolderJobTitle: string;
  dasHolderEmail: string;
  dasHolderPhone: string;
  notes: string;
};

export function parseOrganisation(form: FormData): { data?: OrganisationInput; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const data: OrganisationInput = {
    legalName: required(form.get("legalName"), "legalName", errors),
    tradingName: optional(form.get("tradingName")),
    companiesHouseNo: optional(form.get("companiesHouseNo")),
    addressLine1: required(form.get("addressLine1"), "addressLine1", errors),
    city: required(form.get("city"), "city", errors),
    postcode: required(form.get("postcode"), "postcode", errors),
    sector: optional(form.get("sector")),
    employeeCount: intField(form.get("employeeCount"), "employeeCount", errors, { min: 1 }),
    levyStatus: required(form.get("levyStatus"), "levyStatus", errors),
    dasAccountId: required(form.get("dasAccountId"), "dasAccountId", errors),
    dasHolderName: required(form.get("dasHolderName"), "dasHolderName", errors),
    dasHolderJobTitle: required(form.get("dasHolderJobTitle"), "dasHolderJobTitle", errors),
    dasHolderEmail: emailField(form.get("dasHolderEmail"), "dasHolderEmail", errors),
    dasHolderPhone: required(form.get("dasHolderPhone"), "dasHolderPhone", errors),
    notes: optional(form.get("notes")),
  };
  if (!data.dasHolderName || !data.dasHolderEmail || !data.dasHolderPhone || !data.dasHolderJobTitle || !data.dasAccountId) {
    errors.das = "Every organisation must have Digital Apprenticeship Service (DAS) account holder details.";
  }
  return { data: Object.keys(errors).length ? undefined : data, errors };
}

export type LearnerInput = {
  firstName: string;
  lastName: string;
  preferredName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  nationalInsurance: string;
  uln: string;
  addressLine1: string;
  city: string;
  postcode: string;
  jobTitle: string;
  organisationId: string;
  programmeId: string;
  lineManagerName: string;
  lineManagerJobTitle: string;
  lineManagerEmail: string;
  lineManagerPhone: string;
  status: string;
  pipelineStage: string;
  startDate: string;
  plannedEndDate: string;
  otjHoursRequired: number | null;
  rightToWorkChecked: boolean;
  residencyEligible: boolean;
  privacyNotice: boolean;
  marketingConsent: boolean;
};

export function parseLearner(form: FormData): { data?: LearnerInput; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const data: LearnerInput = {
    firstName: required(form.get("firstName"), "firstName", errors),
    lastName: required(form.get("lastName"), "lastName", errors),
    preferredName: optional(form.get("preferredName")),
    email: emailField(form.get("email"), "email", errors),
    phone: optional(form.get("phone")),
    dateOfBirth: optional(form.get("dateOfBirth")),
    nationalInsurance: optional(form.get("nationalInsurance")),
    uln: optional(form.get("uln")),
    addressLine1: optional(form.get("addressLine1")),
    city: optional(form.get("city")),
    postcode: optional(form.get("postcode")),
    jobTitle: optional(form.get("jobTitle")),
    organisationId: required(form.get("organisationId"), "organisationId", errors),
    programmeId: optional(form.get("programmeId")),
    lineManagerName: required(form.get("lineManagerName"), "lineManagerName", errors),
    lineManagerJobTitle: required(form.get("lineManagerJobTitle"), "lineManagerJobTitle", errors),
    lineManagerEmail: emailField(form.get("lineManagerEmail"), "lineManagerEmail", errors),
    lineManagerPhone: required(form.get("lineManagerPhone"), "lineManagerPhone", errors),
    status: required(form.get("status"), "status", errors),
    pipelineStage: required(form.get("pipelineStage"), "pipelineStage", errors),
    startDate: optional(form.get("startDate")),
    plannedEndDate: optional(form.get("plannedEndDate")),
    otjHoursRequired: intField(form.get("otjHoursRequired"), "otjHoursRequired", errors, { min: 0 }),
    rightToWorkChecked: form.get("rightToWorkChecked") === "on",
    residencyEligible: form.get("residencyEligible") === "on",
    privacyNotice: form.get("privacyNotice") === "on",
    marketingConsent: form.get("marketingConsent") === "on",
  };
  if (!data.lineManagerName || !data.lineManagerEmail || !data.lineManagerPhone || !data.lineManagerJobTitle) {
    errors.lineManager = "Every prospect must provide their line manager’s details.";
  }
  if (!data.privacyNotice) {
    errors.privacyNotice = "The individual must acknowledge the privacy notice before their record is created.";
  }
  return { data: Object.keys(errors).length ? undefined : data, errors };
}

export function firstError(errors: FieldErrors): string {
  return Object.values(errors)[0] ?? "Please correct the highlighted fields.";
}
