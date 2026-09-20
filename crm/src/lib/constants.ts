export const BRAND = {
  name: "Training in Data",
  short: "TiD CRM",
  email: "contact@trainingindata.com",
  location: "Paddington Station, London, UK",
  privacyNoticeVersion: "TiD-PP-2026-08-19",
  icoNote: "Complaints may be raised with the Information Commissioner’s Office (ICO).",
};

export const ROLES = [
  { value: "ADMIN", label: "Administrator" },
  { value: "RECRUITMENT", label: "Student recruitment" },
  { value: "TUTOR", label: "Tutor / coach" },
  { value: "COMPLIANCE", label: "GDPR & funding compliance" },
  { value: "EMPLOYER_LIAISON", label: "Employer liaison" },
] as const;

export const PIPELINE_STAGES = [
  { value: "ENQUIRY", label: "Enquiry" },
  { value: "APPLICATION", label: "Application" },
  { value: "ELIGIBILITY", label: "Eligibility" },
  { value: "EMPLOYER_READY", label: "Employer ready" },
  { value: "DAS_RESERVED", label: "DAS reserved" },
  { value: "COMMITMENT", label: "Commitment statement" },
  { value: "ENROLLED", label: "Enrolled" },
] as const;

export const LEARNER_STATUSES = [
  { value: "PROSPECT", label: "Prospect" },
  { value: "APPLICATION", label: "Application in progress" },
  { value: "ENROLLED", label: "Enrolled" },
  { value: "IN_LEARNING", label: "In learning" },
  { value: "BREAK_IN_LEARNING", label: "Break in learning" },
  { value: "GATEWAY", label: "Gateway" },
  { value: "EPA", label: "End-point assessment" },
  { value: "COMPLETED", label: "Completed" },
  { value: "AT_RISK", label: "At risk of dropout" },
  { value: "WITHDRAWN", label: "Withdrawn" },
  { value: "ERASED", label: "Record anonymised" },
] as const;

export const LEVY_STATUSES = [
  { value: "LEVY", label: "Levy payer" },
  { value: "NON_LEVY", label: "Non-levy (Apprenticeship Service)" },
  { value: "TRANSFER", label: "Levy transfer recipient" },
] as const;

export const PROGRESS_TYPES = [
  { value: "REVIEW", label: "Progress review" },
  { value: "OTJ", label: "Off-the-job hours" },
  { value: "MILESTONE", label: "Milestone" },
  { value: "ASSESSMENT", label: "Assessment" },
  { value: "ATTENDANCE", label: "Attendance" },
  { value: "GATEWAY", label: "Gateway" },
  { value: "EPA", label: "EPA" },
  { value: "SUPPORT", label: "Learning support" },
] as const;

export const ANOMALY_TYPES = [
  { value: "OTJ_SHORTFALL", label: "Off-the-job hours shortfall" },
  { value: "MISSED_REVIEW", label: "Missed progress review" },
  { value: "ATTENDANCE", label: "Attendance concern" },
  { value: "BREAK_IN_LEARNING", label: "Break in learning" },
  { value: "FUNDING", label: "Funding / DAS issue" },
  { value: "ELIGIBILITY", label: "Eligibility / residency" },
  { value: "SAFEGUARDING", label: "Safeguarding" },
  { value: "DATA_QUALITY", label: "Data quality / ILR mismatch" },
  { value: "EPA_DELAY", label: "EPA / gateway delay" },
  { value: "EMPLOYER", label: "Employer / line manager issue" },
  { value: "OTHER", label: "Other" },
] as const;

export const SEVERITIES = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
] as const;

export const ANOMALY_STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "INVESTIGATING", label: "Investigating" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "ACCEPTED", label: "Accepted risk" },
] as const;

export const DROPOUT_STATUSES = [
  { value: "AT_RISK", label: "At risk — retain" },
  { value: "WITHDRAWN", label: "Withdrawn" },
  { value: "RE_ENGAGED", label: "Brought back" },
  { value: "CLOSED_NOT_RETURNING", label: "Closed — not returning" },
] as const;

export const ILR_WITHDRAWAL_REASONS = [
  { value: "02", label: "02 — Transferred to another provider" },
  { value: "03", label: "03 — Transferred to another programme with the same provider" },
  { value: "07", label: "07 — Other personal reasons" },
  { value: "29", label: "29 — Injury / disability / illness" },
  { value: "41", label: "41 — Exclusion" },
  { value: "43", label: "43 — Financial reasons" },
  { value: "97", label: "97 — Other" },
  { value: "98", label: "98 — Reason not known" },
] as const;

export const REENGAGEMENT_TYPES = [
  { value: "EMAIL", label: "Email" },
  { value: "CALL", label: "Phone call" },
  { value: "MEETING", label: "Meeting" },
  { value: "SMS", label: "SMS" },
  { value: "LETTER", label: "Letter" },
  { value: "EMPLOYER_CONTACT", label: "Employer / line manager contact" },
  { value: "WELLBEING", label: "Wellbeing / support offer" },
] as const;

export const REENGAGEMENT_OUTCOMES = [
  { value: "LEFT_MESSAGE", label: "Left message" },
  { value: "NO_RESPONSE", label: "No response" },
  { value: "SPOKE", label: "Spoke — considering" },
  { value: "COMMITTED_RETURN", label: "Committed to return" },
  { value: "RETURNED", label: "Returned to programme" },
  { value: "DECLINED", label: "Declined to return" },
  { value: "EMPLOYER_SUPPORTING", label: "Employer supporting return" },
] as const;

export const CONSENT_PURPOSES = [
  { value: "PRIVACY_NOTICE", label: "Privacy notice acknowledged", basis: "LEGAL_OBLIGATION" },
  { value: "TRAINING_DELIVERY", label: "Training delivery & learner file", basis: "CONTRACT" },
  { value: "ESFA_ILR", label: "ESFA / ILR / Apprenticeship Service sharing", basis: "LEGAL_OBLIGATION" },
  { value: "EPAO_SHARE", label: "End-point assessment organisation sharing", basis: "CONTRACT" },
  { value: "EMPLOYER_SHARE", label: "Employer & line manager communications", basis: "CONTRACT" },
  { value: "MARKETING", label: "Marketing about Training in Data programmes", basis: "CONSENT" },
  { value: "PHOTO_MEDIA", label: "Photos / case studies / media", basis: "CONSENT" },
  { value: "LEARNING_SUPPORT", label: "Learning support / health information", basis: "EXPLICIT_CONSENT" },
] as const;

export const LAWFUL_BASES = [
  { value: "CONSENT", label: "Consent (UK GDPR Art. 6(1)(a))" },
  { value: "CONTRACT", label: "Contract (Art. 6(1)(b))" },
  { value: "LEGAL_OBLIGATION", label: "Legal obligation (Art. 6(1)(c))" },
  { value: "VITAL_INTERESTS", label: "Vital interests (Art. 6(1)(d))" },
  { value: "PUBLIC_TASK", label: "Public task (Art. 6(1)(e))" },
  { value: "LEGITIMATE_INTERESTS", label: "Legitimate interests (Art. 6(1)(f))" },
  { value: "EXPLICIT_CONSENT", label: "Explicit consent (special category, Art. 9(2)(a))" },
] as const;

export const GDPR_REQUEST_TYPES = [
  { value: "ACCESS", label: "Subject access request (SAR)" },
  { value: "RECTIFICATION", label: "Rectification" },
  { value: "ERASURE", label: "Erasure / right to be forgotten" },
  { value: "RESTRICTION", label: "Restriction of processing" },
  { value: "PORTABILITY", label: "Data portability" },
  { value: "OBJECTION", label: "Objection" },
  { value: "WITHDRAW_CONSENT", label: "Withdraw consent" },
] as const;

export const GDPR_STATUSES = [
  { value: "RECEIVED", label: "Received" },
  { value: "ID_VERIFIED", label: "Identity verified" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REJECTED", label: "Rejected" },
  { value: "LEGALLY_RETAINED", label: "Completed with legal retention" },
] as const;

export const REMOVAL_STATUSES = [
  { value: "REQUESTED", label: "Removal requested" },
  { value: "IN_PROGRESS", label: "Being processed" },
  { value: "ERASED", label: "Personal data erased" },
  { value: "ANONYMISED", label: "Anonymised (funding record retained)" },
  { value: "RETAINED_LEGAL", label: "Retained under legal obligation" },
  { value: "REJECTED", label: "Rejected" },
] as const;

export function labelOf<T extends { value: string; label: string }>(
  list: readonly T[],
  value: string,
): string {
  return list.find((item) => item.value === value)?.label ?? value;
}
