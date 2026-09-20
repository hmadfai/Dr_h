"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { login as doLogin, logout as doLogout, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt, hmacIndex } from "@/lib/crypto";
import { writeAudit } from "@/lib/audit";
import { firstError, parseLearner, parseOrganisation } from "@/lib/validators";
import { isSuppressed, nextReference, processErasure } from "@/lib/gdpr";
import { BRAND, CONSENT_PURPOSES } from "@/lib/constants";
import { sendEmail, renderTemplate } from "@/lib/email";
import { refreshOtjAnomaly } from "@/lib/anomalies";

export type ActionState = { error?: string; ok?: string } | null;

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };
  const result = await doLogin(email, password);
  if ("error" in result && result.error) return { error: result.error };
  redirect("/dashboard");
}

export async function logoutAction() {
  await doLogout();
  redirect("/login");
}

async function recordConsents(opts: {
  learnerId?: string;
  organisationId?: string;
  subjectType: string;
  subjectName: string;
  email: string;
  marketing: boolean;
  recordedById: string;
  extra?: Array<{ purpose: string; given: boolean; basis: string }>;
}) {
  const hash = hmacIndex(opts.email);
  const now = new Date();
  const rows = [
    { purpose: "PRIVACY_NOTICE", given: true, basis: "LEGAL_OBLIGATION" },
    { purpose: "TRAINING_DELIVERY", given: true, basis: "CONTRACT" },
    { purpose: "ESFA_ILR", given: true, basis: "LEGAL_OBLIGATION" },
    { purpose: "EMPLOYER_SHARE", given: true, basis: "CONTRACT" },
    { purpose: "MARKETING", given: opts.marketing, basis: "CONSENT" },
    ...(opts.extra ?? []),
  ];
  for (const row of rows) {
    const meta = CONSENT_PURPOSES.find((p) => p.value === row.purpose);
    await prisma.consentRecord.create({
      data: {
        subjectType: opts.subjectType,
        subjectName: opts.subjectName,
        subjectEmailHash: hash,
        learnerId: opts.learnerId ?? null,
        organisationId: opts.organisationId ?? null,
        purpose: row.purpose,
        lawfulBasis: row.basis,
        privacyNoticeVersion: BRAND.privacyNoticeVersion,
        given: row.given,
        method: "CRM_FORM",
        givenAt: now,
        evidence: meta?.label ?? row.purpose,
        recordedById: opts.recordedById,
      },
    });
  }
}

export async function createOrganisationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parseOrganisation(form);
  if (!parsed.data) return { error: firstError(parsed.errors) };
  const data = parsed.data;
  const org = await prisma.organisation.create({
    data: {
      legalName: data.legalName,
      tradingName: data.tradingName || null,
      companiesHouseNo: data.companiesHouseNo || null,
      addressLine1: encrypt(data.addressLine1),
      city: data.city,
      postcode: encrypt(data.postcode),
      sector: data.sector || null,
      employeeCount: data.employeeCount,
      levyStatus: data.levyStatus,
      dasAccountId: encrypt(data.dasAccountId),
      dasHolderName: data.dasHolderName,
      dasHolderJobTitle: data.dasHolderJobTitle,
      dasHolderEmail: encrypt(data.dasHolderEmail),
      dasHolderEmailHash: hmacIndex(data.dasHolderEmail),
      dasHolderPhone: encrypt(data.dasHolderPhone),
      notes: data.notes || null,
    },
  });
  await recordConsents({
    organisationId: org.id,
    subjectType: "DAS_HOLDER",
    subjectName: data.dasHolderName,
    email: data.dasHolderEmail,
    marketing: false,
    recordedById: user.id,
    extra: [{ purpose: "ESFA_ILR", given: true, basis: "LEGAL_OBLIGATION" }],
  });
  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "CREATE",
    entityType: "Organisation",
    entityId: org.id,
    metadata: { legalName: org.legalName },
  });
  revalidatePath("/organisations");
  redirect(`/organisations/${org.id}`);
}

export async function updateOrganisationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  const parsed = parseOrganisation(form);
  if (!parsed.data) return { error: firstError(parsed.errors) };
  const data = parsed.data;
  await prisma.organisation.update({
    where: { id },
    data: {
      legalName: data.legalName,
      tradingName: data.tradingName || null,
      companiesHouseNo: data.companiesHouseNo || null,
      addressLine1: encrypt(data.addressLine1),
      city: data.city,
      postcode: encrypt(data.postcode),
      sector: data.sector || null,
      employeeCount: data.employeeCount,
      levyStatus: data.levyStatus,
      dasAccountId: encrypt(data.dasAccountId),
      dasHolderName: data.dasHolderName,
      dasHolderJobTitle: data.dasHolderJobTitle,
      dasHolderEmail: encrypt(data.dasHolderEmail),
      dasHolderEmailHash: hmacIndex(data.dasHolderEmail),
      dasHolderPhone: encrypt(data.dasHolderPhone),
      notes: data.notes || null,
    },
  });
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "UPDATE", entityType: "Organisation", entityId: id });
  revalidatePath(`/organisations/${id}`);
  return { ok: "Organisation updated." };
}

export async function createLearnerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = parseLearner(form);
  if (!parsed.data) return { error: firstError(parsed.errors) };
  const data = parsed.data;
  if (await isSuppressed(data.email)) {
    return { error: "This person is on the removal register and must not be re-added." };
  }
  const programme = data.programmeId
    ? await prisma.programme.findUnique({ where: { id: data.programmeId } })
    : null;
  const reference = await nextReference("TID", "learner");
  const learner = await prisma.learner.create({
    data: {
      reference,
      firstName: data.firstName,
      lastName: data.lastName,
      preferredName: data.preferredName || null,
      email: encrypt(data.email),
      emailHash: hmacIndex(data.email),
      phone: encrypt(data.phone),
      dateOfBirth: encrypt(data.dateOfBirth),
      nationalInsurance: encrypt(data.nationalInsurance),
      uln: encrypt(data.uln),
      addressLine1: encrypt(data.addressLine1),
      city: data.city || null,
      postcode: encrypt(data.postcode),
      jobTitle: data.jobTitle || null,
      organisationId: data.organisationId,
      programmeId: data.programmeId || null,
      lineManagerName: data.lineManagerName,
      lineManagerJobTitle: data.lineManagerJobTitle,
      lineManagerEmail: encrypt(data.lineManagerEmail),
      lineManagerPhone: encrypt(data.lineManagerPhone),
      status: data.status,
      pipelineStage: data.pipelineStage,
      startDate: data.startDate ? new Date(data.startDate) : null,
      plannedEndDate: data.plannedEndDate ? new Date(data.plannedEndDate) : null,
      otjHoursRequired: data.otjHoursRequired ?? programme?.otjHoursTarget ?? 0,
      rightToWorkChecked: data.rightToWorkChecked,
      residencyEligible: data.residencyEligible,
    },
  });
  await recordConsents({
    learnerId: learner.id,
    organisationId: data.organisationId,
    subjectType: "LEARNER",
    subjectName: `${data.firstName} ${data.lastName}`,
    email: data.email,
    marketing: data.marketingConsent,
    recordedById: user.id,
  });
  await recordConsents({
    learnerId: learner.id,
    organisationId: data.organisationId,
    subjectType: "LINE_MANAGER",
    subjectName: data.lineManagerName,
    email: data.lineManagerEmail,
    marketing: false,
    recordedById: user.id,
    extra: [{ purpose: "EMPLOYER_SHARE", given: true, basis: "CONTRACT" }],
  });
  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "CREATE",
    entityType: "Learner",
    entityId: learner.id,
    metadata: { reference },
  });
  revalidatePath("/learners");
  redirect(`/learners/${learner.id}`);
}

export async function updateLearnerAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  const parsed = parseLearner(form);
  if (!parsed.data) return { error: firstError(parsed.errors) };
  const data = parsed.data;
  await prisma.learner.update({
    where: { id },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      preferredName: data.preferredName || null,
      email: encrypt(data.email),
      emailHash: hmacIndex(data.email),
      phone: encrypt(data.phone),
      dateOfBirth: encrypt(data.dateOfBirth),
      nationalInsurance: encrypt(data.nationalInsurance),
      uln: encrypt(data.uln),
      addressLine1: encrypt(data.addressLine1),
      city: data.city || null,
      postcode: encrypt(data.postcode),
      jobTitle: data.jobTitle || null,
      organisationId: data.organisationId,
      programmeId: data.programmeId || null,
      lineManagerName: data.lineManagerName,
      lineManagerJobTitle: data.lineManagerJobTitle,
      lineManagerEmail: encrypt(data.lineManagerEmail),
      lineManagerPhone: encrypt(data.lineManagerPhone),
      status: data.status,
      pipelineStage: data.pipelineStage,
      startDate: data.startDate ? new Date(data.startDate) : null,
      plannedEndDate: data.plannedEndDate ? new Date(data.plannedEndDate) : null,
      otjHoursRequired: data.otjHoursRequired ?? 0,
      rightToWorkChecked: data.rightToWorkChecked,
      residencyEligible: data.residencyEligible,
    },
  });
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "UPDATE", entityType: "Learner", entityId: id });
  revalidatePath(`/learners/${id}`);
  return { ok: "Learner updated." };
}

export async function addProgressAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const learnerId = String(form.get("learnerId") ?? "");
  const type = String(form.get("type") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const details = String(form.get("details") ?? "").trim();
  const hoursRaw = String(form.get("hours") ?? "").trim();
  const percentRaw = String(form.get("percent") ?? "").trim();
  const occurredAt = String(form.get("occurredAt") ?? "");
  if (!learnerId || !type || !title || !occurredAt) return { error: "Type, title and date are required." };
  const hours = hoursRaw ? Number(hoursRaw) : null;
  await prisma.progressEntry.create({
    data: {
      learnerId,
      type,
      title,
      details: details || null,
      hours,
      percent: percentRaw ? Number(percentRaw) : null,
      occurredAt: new Date(occurredAt),
      recordedById: user.id,
    },
  });
  if (type === "OTJ" && hours) {
    await prisma.learner.update({
      where: { id: learnerId },
      data: { otjHoursLogged: { increment: hours } },
    });
    await refreshOtjAnomaly(learnerId, user.id);
  }
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "PROGRESS", entityType: "Learner", entityId: learnerId, metadata: { type, title } });
  revalidatePath(`/learners/${learnerId}`);
  revalidatePath("/progress");
  return { ok: "Progress recorded." };
}

export async function addAnomalyAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const learnerId = String(form.get("learnerId") ?? "");
  const type = String(form.get("type") ?? "");
  const severity = String(form.get("severity") ?? "MEDIUM");
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  if (!learnerId || !type || !title || !description) return { error: "Learner, type, title and description are required." };
  await prisma.anomaly.create({
    data: { learnerId, type, severity, title, description, status: "OPEN", ownerId: user.id },
  });
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "ANOMALY_OPEN", entityType: "Learner", entityId: learnerId });
  revalidatePath("/anomalies");
  revalidatePath(`/learners/${learnerId}`);
  return { ok: "Anomaly recorded." };
}

export async function updateAnomalyAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "");
  const resolution = String(form.get("resolution") ?? "").trim();
  await prisma.anomaly.update({
    where: { id },
    data: {
      status,
      resolution: resolution || null,
      resolvedAt: ["RESOLVED", "ACCEPTED"].includes(status) ? new Date() : null,
    },
  });
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "ANOMALY_UPDATE", entityType: "Anomaly", entityId: id });
  revalidatePath("/anomalies");
}

export async function createDropoutAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const learnerId = String(form.get("learnerId") ?? "");
  const status = String(form.get("status") ?? "AT_RISK");
  const reasonDetail = String(form.get("reasonDetail") ?? "").trim();
  const ilrReasonCode = String(form.get("ilrReasonCode") ?? "") || null;
  if (!learnerId || !reasonDetail) return { error: "Learner and reason are required." };
  const dropout = await prisma.dropoutCase.create({
    data: {
      learnerId,
      status,
      reasonDetail,
      ilrReasonCode,
      atRiskSince: new Date(),
      withdrawalDate: status === "WITHDRAWN" ? new Date() : null,
      assignedToId: user.id,
    },
  });
  await prisma.learner.update({
    where: { id: learnerId },
    data: { status: status === "WITHDRAWN" ? "WITHDRAWN" : "AT_RISK" },
  });
  await prisma.task.create({
    data: {
      title: "Re-engagement follow-up",
      details: "Contact the learner and their line manager within 2 working days.",
      dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      status: "OPEN",
      relatedType: "DropoutCase",
      relatedId: dropout.id,
      assigneeId: user.id,
    },
  });
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "DROPOUT_OPEN", entityType: "DropoutCase", entityId: dropout.id });
  revalidatePath("/dropouts");
  redirect(`/dropouts/${dropout.id}`);
}

export async function addReengagementAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const dropoutCaseId = String(form.get("dropoutCaseId") ?? "");
  const type = String(form.get("type") ?? "");
  const summary = String(form.get("summary") ?? "").trim();
  const outcome = String(form.get("outcome") ?? "");
  if (!dropoutCaseId || !type || !summary || !outcome) return { error: "Activity type, summary and outcome are required." };
  const activity = await prisma.reengagementActivity.create({
    data: { dropoutCaseId, type, summary, outcome, performedById: user.id },
  });
  const dropout = await prisma.dropoutCase.findUnique({ where: { id: dropoutCaseId } });
  if (dropout && (outcome === "RETURNED" || outcome === "COMMITTED_RETURN")) {
    await prisma.dropoutCase.update({
      where: { id: dropoutCaseId },
      data: { status: "RE_ENGAGED" },
    });
    await prisma.learner.update({
      where: { id: dropout.learnerId },
      data: { status: "IN_LEARNING" },
    });
  }
  if (dropout && outcome === "DECLINED") {
    await prisma.dropoutCase.update({
      where: { id: dropoutCaseId },
      data: { status: "CLOSED_NOT_RETURNING", withdrawalDate: new Date() },
    });
    await prisma.learner.update({
      where: { id: dropout.learnerId },
      data: { status: "WITHDRAWN", actualEndDate: new Date() },
    });
  }
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "REENGAGEMENT", entityType: "ReengagementActivity", entityId: activity.id });
  revalidatePath(`/dropouts/${dropoutCaseId}`);
  return { ok: "Re-engagement activity logged." };
}

export async function sendTemplatedEmailAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const templateId = String(form.get("templateId") ?? "");
  const to = String(form.get("to") ?? "").trim();
  const cc = String(form.get("cc") ?? "").trim();
  const relatedType = String(form.get("relatedType") ?? "") || undefined;
  const relatedId = String(form.get("relatedId") ?? "") || undefined;
  const subjectOverride = String(form.get("subject") ?? "").trim();
  const bodyOverride = String(form.get("body") ?? "").trim();
  if (!to) return { error: "A recipient is required." };
  const vars: Record<string, string> = {};
  Array.from(form.entries()).forEach(([key, value]) => {
    if (key.startsWith("var_")) vars[key.slice(4)] = String(value);
  });
  let subject = subjectOverride;
  let body = bodyOverride;
  if (templateId) {
    const template = await prisma.emailTemplate.findUnique({ where: { id: templateId } });
    if (template) {
      subject = subject || renderTemplate(template.subject, vars);
      body = body || renderTemplate(template.body, vars);
    }
  }
  if (!subject || !body) return { error: "Subject and body are required." };
  const result = await sendEmail({
    to,
    cc,
    subject,
    body,
    templateId: templateId || undefined,
    relatedType,
    relatedId,
    createdById: user.id,
  });
  if (result.status === "FAILED") return { error: result.error };
  revalidatePath("/email");
  return { ok: result.status === "SIMULATED" ? "Email recorded in the outbox (SMTP is not configured — simulated send)." : "Email sent." };
}

export async function saveSmtpAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (user.role !== "ADMIN") return { error: "Only administrators can change mail settings." };
  const entries: Record<string, string> = {
    smtpHost: String(form.get("smtpHost") ?? "").trim(),
    smtpPort: String(form.get("smtpPort") ?? "587").trim(),
    smtpUser: String(form.get("smtpUser") ?? "").trim(),
    smtpFrom: String(form.get("smtpFrom") ?? "").trim(),
  };
  const pass = String(form.get("smtpPass") ?? "");
  for (const [key, value] of Object.entries(entries)) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  if (pass) {
    await prisma.appSetting.upsert({
      where: { key: "smtpPass" },
      create: { key: "smtpPass", value: encrypt(pass) },
      update: { value: encrypt(pass) },
    });
  }
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "SETTINGS", entityType: "AppSetting", entityId: "smtp" });
  revalidatePath("/settings");
  return { ok: "Mail settings saved. Use a test email from the Email workspace to confirm delivery." };
}

export async function addConsentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const learnerId = String(form.get("learnerId") ?? "") || null;
  const subjectName = String(form.get("subjectName") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const purpose = String(form.get("purpose") ?? "");
  const lawfulBasis = String(form.get("lawfulBasis") ?? "");
  const method = String(form.get("method") ?? "CRM_FORM");
  const given = form.get("given") === "on";
  if (!subjectName || !email || !purpose || !lawfulBasis) return { error: "Name, email, purpose and lawful basis are required." };
  await prisma.consentRecord.create({
    data: {
      subjectType: String(form.get("subjectType") ?? "LEARNER"),
      subjectName,
      subjectEmailHash: hmacIndex(email),
      learnerId,
      organisationId: String(form.get("organisationId") ?? "") || null,
      purpose,
      lawfulBasis,
      privacyNoticeVersion: BRAND.privacyNoticeVersion,
      given,
      method,
      givenAt: new Date(),
      evidence: String(form.get("evidence") ?? "") || null,
      recordedById: user.id,
    },
  });
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "CONSENT", entityType: "ConsentRecord", entityId: learnerId ?? email });
  revalidatePath("/gdpr");
  return { ok: "Consent recorded." };
}

export async function withdrawConsentAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  await prisma.consentRecord.update({ where: { id }, data: { given: false, withdrawnAt: new Date() } });
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "CONSENT_WITHDRAWN", entityType: "ConsentRecord", entityId: id });
  revalidatePath("/gdpr");
}

export async function createGdprRequestAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const type = String(form.get("type") ?? "");
  const subjectName = String(form.get("subjectName") ?? "").trim();
  const subjectEmail = String(form.get("subjectEmail") ?? "").trim().toLowerCase();
  const notes = String(form.get("notes") ?? "").trim();
  if (!type || !subjectName || !subjectEmail) return { error: "Type, name and email are required." };
  const hash = hmacIndex(subjectEmail);
  const learner = await prisma.learner.findFirst({ where: { emailHash: hash } });
  const reference = await nextReference("DSR", "gdpr");
  const receivedAt = new Date();
  const dueAt = new Date(receivedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  const request = await prisma.gdprRequest.create({
    data: {
      reference,
      type,
      status: "RECEIVED",
      subjectName,
      subjectEmail: encrypt(subjectEmail),
      subjectEmailHash: hash,
      learnerId: learner?.id ?? null,
      receivedAt,
      dueAt,
      notes: notes || null,
      assignedToId: user.id,
    },
  });
  if (type === "ERASURE") {
    await prisma.removalRecord.create({
      data: {
        gdprRequestId: request.id,
        learnerId: learner?.id ?? null,
        subjectNameSnapshot: subjectName,
        subjectEmailHash: hash,
        requestedAt: receivedAt,
        status: "REQUESTED",
      },
    });
  }
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "GDPR_REQUEST", entityType: "GdprRequest", entityId: request.id });
  revalidatePath("/gdpr");
  return { ok: `Request ${reference} logged. One-month UK GDPR deadline: ${dueAt.toLocaleDateString("en-GB")}.` };
}

export async function updateGdprRequestAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "");
  const identityVerified = form.get("identityVerified") === "on";
  await prisma.gdprRequest.update({
    where: { id },
    data: {
      status,
      identityVerified,
      completedAt: ["COMPLETED", "REJECTED", "LEGALLY_RETAINED"].includes(status) ? new Date() : null,
    },
  });
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "GDPR_UPDATE", entityType: "GdprRequest", entityId: id });
  revalidatePath("/gdpr");
}

export async function processErasureAction(form: FormData) {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "COMPLIANCE") {
    throw new Error("Only compliance or admin users can process erasure.");
  }
  const id = String(form.get("id") ?? "");
  await processErasure({ requestId: id, actorId: user.id, actorEmail: user.email });
  revalidatePath("/gdpr");
  revalidatePath("/learners");
}

export async function addTaskAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };
  await prisma.task.create({
    data: {
      title,
      details: String(form.get("details") ?? "") || null,
      dueAt: form.get("dueAt") ? new Date(String(form.get("dueAt"))) : null,
      status: "OPEN",
      relatedType: String(form.get("relatedType") ?? "") || null,
      relatedId: String(form.get("relatedId") ?? "") || null,
      assigneeId: user.id,
    },
  });
  revalidatePath("/tasks");
  return { ok: "Task created." };
}

export async function completeTaskAction(form: FormData) {
  await requireUser();
  await prisma.task.update({ where: { id: String(form.get("id")) }, data: { status: "DONE" } });
  revalidatePath("/tasks");
}

export async function addNoteAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const body = String(form.get("body") ?? "").trim();
  const relatedType = String(form.get("relatedType") ?? "");
  const relatedId = String(form.get("relatedId") ?? "");
  if (!body) return { error: "Note cannot be empty." };
  await prisma.note.create({
    data: {
      body,
      relatedType,
      relatedId,
      learnerId: relatedType === "Learner" ? relatedId : null,
      authorId: user.id,
    },
  });
  revalidatePath(`/learners/${relatedId}`);
  return { ok: "Note added." };
}

export async function saveProgrammeAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const standardCode = String(form.get("standardCode") ?? "").trim();
  const level = Number(form.get("level") ?? 0);
  const durationMonths = Number(form.get("durationMonths") ?? 0);
  const otjHoursTarget = Number(form.get("otjHoursTarget") ?? 0);
  if (!name || !standardCode || !level || !durationMonths) return { error: "Name, standard, level and duration are required." };
  const data = {
    name,
    standardCode,
    level,
    durationMonths,
    fundingBandMax: form.get("fundingBandMax") ? Number(form.get("fundingBandMax")) : null,
    epao: String(form.get("epao") ?? "") || null,
    otjHoursTarget,
    description: String(form.get("description") ?? "") || null,
    active: form.get("active") !== "off",
  };
  if (id) {
    await prisma.programme.update({ where: { id }, data });
  } else {
    await prisma.programme.create({ data });
  }
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: id ? "UPDATE" : "CREATE", entityType: "Programme", entityId: id || name });
  revalidatePath("/programmes");
  return { ok: "Programme saved." };
}

export async function movePipelineAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  const pipelineStage = String(form.get("pipelineStage") ?? "");
  const status = pipelineStage === "ENROLLED" ? "ENROLLED" : undefined;
  await prisma.learner.update({
    where: { id },
    data: { pipelineStage, ...(status ? { status } : {}) },
  });
  await writeAudit({ actorId: user.id, actorEmail: user.email, action: "PIPELINE", entityType: "Learner", entityId: id, metadata: { pipelineStage } });
  revalidatePath("/pipeline");
}
