import { prisma } from "./prisma";
import { decrypt, encrypt, hmacIndex } from "./crypto";
import { writeAudit } from "./audit";
import { BRAND } from "./constants";

export async function isSuppressed(email: string) {
  const hash = hmacIndex(email);
  const record = await prisma.removalRecord.findFirst({
    where: {
      subjectEmailHash: hash,
      status: { in: ["ERASED", "ANONYMISED"] },
    },
  });
  return Boolean(record);
}

export async function nextReference(prefix: string, seqName: string) {
  const year = new Date().getFullYear();
  const seq = await prisma.sequence.upsert({
    where: { name: seqName },
    create: { name: seqName, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${year}-${String(seq.value).padStart(4, "0")}`;
}

const REDACTED = "[REDACTED]";

export async function processErasure(opts: {
  requestId: string;
  actorId: string;
  actorEmail: string;
}) {
  const request = await prisma.gdprRequest.findUnique({ where: { id: opts.requestId } });
  if (!request) throw new Error("GDPR request not found");
  if (request.type !== "ERASURE") throw new Error("This request is not an erasure request");

  const email = decrypt(request.subjectEmail);
  const hash = request.subjectEmailHash;
  const learners = await prisma.learner.findMany({
    where: { emailHash: hash },
    include: { dropouts: true, progress: true },
  });

  const enrolled = learners.some((l) =>
    ["ENROLLED", "IN_LEARNING", "BREAK_IN_LEARNING", "GATEWAY", "EPA", "COMPLETED", "WITHDRAWN", "AT_RISK"].includes(
      l.status,
    ),
  );

  const legalNote = enrolled
    ? "ILR / ESFA apprenticeship funding records are retained in anonymised form for the statutory funding audit period (typically the current year plus 6 years). Direct identifiers have been overwritten."
    : "Prospect never reached funded enrolment; personal data has been erased. A suppression hash is retained so the person is not re-imported.";

  for (const learner of learners) {
    await prisma.learner.update({
      where: { id: learner.id },
      data: {
        firstName: "Redacted",
        lastName: "Person",
        preferredName: null,
        email: encrypt(`erased-${learner.id}@invalid.invalid`),
        emailHash: hmacIndex(`erased-${learner.id}@invalid.invalid`),
        phone: encrypt(REDACTED),
        dateOfBirth: encrypt(REDACTED),
        nationalInsurance: encrypt(REDACTED),
        uln: encrypt(REDACTED),
        addressLine1: encrypt(REDACTED),
        city: REDACTED,
        postcode: encrypt(REDACTED),
        jobTitle: REDACTED,
        lineManagerName: REDACTED,
        lineManagerJobTitle: REDACTED,
        lineManagerEmail: encrypt(REDACTED),
        lineManagerPhone: encrypt(REDACTED),
        status: "ERASED",
        erasedAt: new Date(),
      },
    });
    await prisma.note.deleteMany({ where: { learnerId: learner.id } });
    await prisma.consentRecord.updateMany({
      where: { learnerId: learner.id },
      data: { subjectName: "Redacted Person", evidence: null },
    });
  }

  await prisma.gdprRequest.update({
    where: { id: request.id },
    data: {
      status: enrolled ? "LEGALLY_RETAINED" : "COMPLETED",
      completedAt: new Date(),
      outcome: legalNote,
      subjectName: "Redacted Person",
      subjectEmail: encrypt(`erased-request-${request.id}@invalid.invalid`),
    },
  });

  const removal = await prisma.removalRecord.upsert({
    where: { gdprRequestId: request.id },
    create: {
      gdprRequestId: request.id,
      learnerId: learners[0]?.id ?? request.learnerId,
      subjectNameSnapshot: "Redacted Person",
      subjectEmailHash: hash,
      requestedAt: request.receivedAt,
      processedAt: new Date(),
      status: enrolled ? "ANONYMISED" : "ERASED",
      legalRetentionNote: legalNote,
      processedById: opts.actorId,
    },
    update: {
      processedAt: new Date(),
      status: enrolled ? "ANONYMISED" : "ERASED",
      legalRetentionNote: legalNote,
      processedById: opts.actorId,
      subjectNameSnapshot: "Redacted Person",
    },
  });

  await writeAudit({
    actorId: opts.actorId,
    actorEmail: opts.actorEmail,
    action: "GDPR_ERASURE",
    entityType: "GdprRequest",
    entityId: request.id,
    metadata: { learners: learners.map((l) => l.id), enrolled, notice: BRAND.privacyNoticeVersion },
  });

  return { removal, enrolled, legalNote };
}

export function learnerPortableRecord(learner: {
  reference: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  jobTitle: string | null;
  status: string;
  pipelineStage: string;
  startDate: Date | null;
  plannedEndDate: Date | null;
  organisation: { legalName: string };
  programme: { name: string; standardCode: string } | null;
  lineManagerName: string;
  lineManagerJobTitle: string;
  consents: Array<{ purpose: string; given: boolean; givenAt: Date; withdrawnAt: Date | null; lawfulBasis: string; privacyNoticeVersion: string }>;
  progress: Array<{ type: string; title: string; occurredAt: Date; hours: number | null; percent: number | null }>;
}) {
  return {
    controller: BRAND.name,
    privacyNoticeVersion: BRAND.privacyNoticeVersion,
    exportedAt: new Date().toISOString(),
    learner: {
      reference: learner.reference,
      firstName: decrypt(learner.firstName) || learner.firstName,
      lastName: decrypt(learner.lastName) || learner.lastName,
      preferredName: learner.preferredName,
      email: decrypt(learner.email),
      phone: decrypt(learner.phone),
      dateOfBirth: decrypt(learner.dateOfBirth),
      jobTitle: learner.jobTitle,
      status: learner.status,
      pipelineStage: learner.pipelineStage,
      startDate: learner.startDate,
      plannedEndDate: learner.plannedEndDate,
      organisation: learner.organisation.legalName,
      programme: learner.programme,
      lineManager: {
        name: learner.lineManagerName,
        jobTitle: learner.lineManagerJobTitle,
      },
    },
    consents: learner.consents,
    progress: learner.progress,
  };
}
