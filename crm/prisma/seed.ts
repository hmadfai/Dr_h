import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { encrypt, hmacIndex } from "../src/lib/crypto";
import { BRAND } from "../src/lib/constants";

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const prisma = new PrismaClient();

async function consent(opts: {
  subjectType: string;
  subjectName: string;
  email: string;
  purpose: string;
  basis: string;
  learnerId?: string;
  organisationId?: string;
  given?: boolean;
  userId: string;
}) {
  await prisma.consentRecord.create({
    data: {
      subjectType: opts.subjectType,
      subjectName: opts.subjectName,
      subjectEmailHash: hmacIndex(opts.email),
      purpose: opts.purpose,
      lawfulBasis: opts.basis,
      privacyNoticeVersion: BRAND.privacyNoticeVersion,
      given: opts.given ?? true,
      method: "IMPORTED",
      givenAt: new Date("2026-04-02"),
      learnerId: opts.learnerId,
      organisationId: opts.organisationId,
      recordedById: opts.userId,
      evidence: "Onboarding pack + privacy notice",
    },
  });
}

async function main() {
  await prisma.reengagementActivity.deleteMany();
  await prisma.dropoutCase.deleteMany();
  await prisma.anomaly.deleteMany();
  await prisma.progressEntry.deleteMany();
  await prisma.note.deleteMany();
  await prisma.consentRecord.deleteMany();
  await prisma.removalRecord.deleteMany();
  await prisma.gdprRequest.deleteMany();
  await prisma.emailMessage.deleteMany();
  await prisma.emailTemplate.deleteMany();
  await prisma.task.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.learner.deleteMany();
  await prisma.organisation.deleteMany();
  await prisma.programme.deleteMany();
  await prisma.user.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.sequence.deleteMany();

  const passwordHash = await bcrypt.hash("Apprentice!2026", 10);
  const [admin, recruitment, tutor, compliance] = await Promise.all([
    prisma.user.create({
      data: { name: "Hasan Al-Madfai", email: "admin@trainingindata.com", passwordHash, role: "ADMIN" },
    }),
    prisma.user.create({
      data: { name: "Aisha Rahman", email: "recruitment@trainingindata.com", passwordHash, role: "RECRUITMENT" },
    }),
    prisma.user.create({
      data: { name: "Daniel Okeke", email: "tutor@trainingindata.com", passwordHash, role: "TUTOR" },
    }),
    prisma.user.create({
      data: { name: "Priya Shah", email: "compliance@trainingindata.com", passwordHash, role: "COMPLIANCE" },
    }),
  ]);

  await prisma.appSetting.createMany({
    data: [
      { key: "privacyNoticeVersion", value: BRAND.privacyNoticeVersion },
      { key: "smtpFrom", value: "Training in Data CRM <crm@trainingindata.com>" },
    ],
  });
  await prisma.sequence.createMany({
    data: [
      { name: "learner", value: 8 },
      { name: "gdpr", value: 3 },
    ],
  });

  const programmes = await Promise.all([
    prisma.programme.create({
      data: {
        name: "Data Analyst",
        standardCode: "ST0118",
        level: 4,
        durationMonths: 18,
        fundingBandMax: 15000,
        epao: "BCS",
        otjHoursTarget: 370,
        description: "Collect, analyse and present data so the employer can make evidence-based decisions.",
      },
    }),
    prisma.programme.create({
      data: {
        name: "Data Technician",
        standardCode: "ST0117",
        level: 3,
        durationMonths: 18,
        fundingBandMax: 12000,
        epao: "BCS",
        otjHoursTarget: 334,
        description: "Source, format and present data for analysis across the business.",
      },
    }),
    prisma.programme.create({
      data: {
        name: "Artificial Intelligence (AI) Data Specialist",
        standardCode: "ST0763",
        level: 7,
        durationMonths: 24,
        fundingBandMax: 20000,
        epao: "University partner EPAO",
        otjHoursTarget: 480,
        description: "Lead AI and advanced analytics change in the workplace.",
      },
    }),
  ]);

  const northwind = await prisma.organisation.create({
    data: {
      legalName: "Northwind Analytics Ltd",
      tradingName: "Northwind",
      companiesHouseNo: "09876543",
      addressLine1: encrypt("22 Eastbourne Terrace"),
      city: "London",
      postcode: encrypt("W2 6LG"),
      sector: "Professional services",
      employeeCount: 420,
      levyStatus: "LEVY",
      dasAccountId: encrypt("DAS-NW-88421"),
      dasHolderName: "Helen Cartwright",
      dasHolderJobTitle: "Head of People (DAS administrator)",
      dasHolderEmail: encrypt("helen.cartwright@northwind.example"),
      dasHolderEmailHash: hmacIndex("helen.cartwright@northwind.example"),
      dasHolderPhone: encrypt("020 7946 0100"),
      notes: "Levy payer. Reservations confirmed for 2026/27.",
    },
  });
  const camden = await prisma.organisation.create({
    data: {
      legalName: "Camden Care NHS Trust",
      tradingName: "Camden Care",
      companiesHouseNo: null,
      addressLine1: encrypt("St Pancras Way"),
      city: "London",
      postcode: encrypt("NW1 0PE"),
      sector: "Health",
      employeeCount: 3800,
      levyStatus: "LEVY",
      dasAccountId: encrypt("DAS-NHS-CC-10293"),
      dasHolderName: "James Adeyemi",
      dasHolderJobTitle: "Apprenticeship lead",
      dasHolderEmail: encrypt("james.adeyemi@camdencare.example"),
      dasHolderEmailHash: hmacIndex("james.adeyemi@camdencare.example"),
      dasHolderPhone: encrypt("020 7946 2200"),
    },
  });
  const brightpath = await prisma.organisation.create({
    data: {
      legalName: "BrightPath Retail Ltd",
      tradingName: "BrightPath",
      companiesHouseNo: "11223344",
      addressLine1: encrypt("14 Praed Street"),
      city: "London",
      postcode: encrypt("W2 1RH"),
      sector: "Retail",
      employeeCount: 85,
      levyStatus: "NON_LEVY",
      dasAccountId: encrypt("DAS-BP-55109"),
      dasHolderName: "Sofia Mendes",
      dasHolderJobTitle: "Finance manager / DAS account holder",
      dasHolderEmail: encrypt("sofia.mendes@brightpath.example"),
      dasHolderEmailHash: hmacIndex("sofia.mendes@brightpath.example"),
      dasHolderPhone: encrypt("020 7946 3300"),
      notes: "Non-levy employer using the apprenticeship service. Reservation required before start.",
    },
  });

  for (const org of [northwind, camden, brightpath]) {
    await consent({
      subjectType: "DAS_HOLDER",
      subjectName: org.dasHolderName,
      email: org === northwind ? "helen.cartwright@northwind.example" : org === camden ? "james.adeyemi@camdencare.example" : "sofia.mendes@brightpath.example",
      purpose: "ESFA_ILR",
      basis: "LEGAL_OBLIGATION",
      organisationId: org.id,
      userId: admin.id,
    });
  }

  const l1 = await prisma.learner.create({
    data: {
      reference: "TID-2026-0001",
      firstName: "Amelia",
      lastName: "Chen",
      email: encrypt("amelia.chen@northwind.example"),
      emailHash: hmacIndex("amelia.chen@northwind.example"),
      phone: encrypt("07700 900111"),
      dateOfBirth: encrypt("1998-03-12"),
      nationalInsurance: encrypt("QQ123456C"),
      uln: encrypt("1234567890"),
      addressLine1: encrypt("Flat 4, 10 Bishop's Bridge Road"),
      city: "London",
      postcode: encrypt("W2 6AA"),
      jobTitle: "Junior analyst",
      organisationId: northwind.id,
      programmeId: programmes[0].id,
      lineManagerName: "Marcus Reid",
      lineManagerJobTitle: "Analytics manager",
      lineManagerEmail: encrypt("marcus.reid@northwind.example"),
      lineManagerPhone: encrypt("07700 900112"),
      status: "IN_LEARNING",
      pipelineStage: "ENROLLED",
      startDate: new Date("2026-01-06"),
      plannedEndDate: new Date("2027-07-06"),
      otjHoursRequired: 370,
      otjHoursLogged: 96,
      rightToWorkChecked: true,
      residencyEligible: true,
    },
  });
  const l2 = await prisma.learner.create({
    data: {
      reference: "TID-2026-0002",
      firstName: "Omar",
      lastName: "Hassan",
      email: encrypt("omar.hassan@camdencare.example"),
      emailHash: hmacIndex("omar.hassan@camdencare.example"),
      phone: encrypt("07700 900221"),
      jobTitle: "Information officer",
      organisationId: camden.id,
      programmeId: programmes[0].id,
      lineManagerName: "Natalie Brooks",
      lineManagerJobTitle: "Head of information",
      lineManagerEmail: encrypt("natalie.brooks@camdencare.example"),
      lineManagerPhone: encrypt("07700 900222"),
      status: "AT_RISK",
      pipelineStage: "ENROLLED",
      startDate: new Date("2025-09-01"),
      plannedEndDate: new Date("2027-03-01"),
      otjHoursRequired: 370,
      otjHoursLogged: 40,
      rightToWorkChecked: true,
      residencyEligible: true,
    },
  });
  const l3 = await prisma.learner.create({
    data: {
      reference: "TID-2026-0003",
      firstName: "Freya",
      lastName: "Patel",
      email: encrypt("freya.patel@brightpath.example"),
      emailHash: hmacIndex("freya.patel@brightpath.example"),
      phone: encrypt("07700 900331"),
      jobTitle: "E-commerce assistant",
      organisationId: brightpath.id,
      programmeId: programmes[1].id,
      lineManagerName: "Tom Walsh",
      lineManagerJobTitle: "Store operations lead",
      lineManagerEmail: encrypt("tom.walsh@brightpath.example"),
      lineManagerPhone: encrypt("07700 900332"),
      status: "APPLICATION",
      pipelineStage: "DAS_RESERVED",
      rightToWorkChecked: true,
      residencyEligible: true,
      otjHoursRequired: 334,
    },
  });
  const l4 = await prisma.learner.create({
    data: {
      reference: "TID-2026-0004",
      firstName: "Luis",
      lastName: "Navarro",
      email: encrypt("luis.navarro@northwind.example"),
      emailHash: hmacIndex("luis.navarro@northwind.example"),
      jobTitle: "Data scientist",
      organisationId: northwind.id,
      programmeId: programmes[2].id,
      lineManagerName: "Helen Cartwright",
      lineManagerJobTitle: "Head of People",
      lineManagerEmail: encrypt("helen.cartwright@northwind.example"),
      lineManagerPhone: encrypt("020 7946 0100"),
      status: "PROSPECT",
      pipelineStage: "ELIGIBILITY",
      otjHoursRequired: 480,
    },
  });
  const l5 = await prisma.learner.create({
    data: {
      reference: "TID-2026-0005",
      firstName: "Grace",
      lastName: "Okafor",
      email: encrypt("grace.okafor@camdencare.example"),
      emailHash: hmacIndex("grace.okafor@camdencare.example"),
      jobTitle: "BI developer",
      organisationId: camden.id,
      programmeId: programmes[0].id,
      lineManagerName: "Natalie Brooks",
      lineManagerJobTitle: "Head of information",
      lineManagerEmail: encrypt("natalie.brooks@camdencare.example"),
      lineManagerPhone: encrypt("07700 900222"),
      status: "WITHDRAWN",
      pipelineStage: "ENROLLED",
      startDate: new Date("2025-10-01"),
      actualEndDate: new Date("2026-06-12"),
      plannedEndDate: new Date("2027-04-01"),
      otjHoursRequired: 370,
      otjHoursLogged: 88,
      rightToWorkChecked: true,
      residencyEligible: true,
    },
  });

  for (const learner of [l1, l2, l3, l4, l5]) {
    const email =
      learner.reference === "TID-2026-0001"
        ? "amelia.chen@northwind.example"
        : learner.reference === "TID-2026-0002"
          ? "omar.hassan@camdencare.example"
          : learner.reference === "TID-2026-0003"
            ? "freya.patel@brightpath.example"
            : learner.reference === "TID-2026-0004"
              ? "luis.navarro@northwind.example"
              : "grace.okafor@camdencare.example";
    for (const purpose of ["PRIVACY_NOTICE", "TRAINING_DELIVERY", "ESFA_ILR", "EMPLOYER_SHARE"] as const) {
      await consent({
        subjectType: "LEARNER",
        subjectName: `${learner.firstName} ${learner.lastName}`,
        email,
        purpose,
        basis: purpose === "PRIVACY_NOTICE" || purpose === "ESFA_ILR" ? "LEGAL_OBLIGATION" : "CONTRACT",
        learnerId: learner.id,
        organisationId: learner.organisationId,
        userId: recruitment.id,
      });
    }
    await consent({
      subjectType: "LEARNER",
      subjectName: `${learner.firstName} ${learner.lastName}`,
      email,
      purpose: "MARKETING",
      basis: "CONSENT",
      learnerId: learner.id,
      given: learner.reference !== "TID-2026-0005",
      userId: recruitment.id,
    });
    await consent({
      subjectType: "LINE_MANAGER",
      subjectName: learner.lineManagerName,
      email: `${learner.lineManagerName.toLowerCase().replace(" ", ".")}@employer.example`,
      purpose: "EMPLOYER_SHARE",
      basis: "CONTRACT",
      learnerId: learner.id,
      organisationId: learner.organisationId,
      userId: recruitment.id,
    });
  }

  await prisma.progressEntry.createMany({
    data: [
      { learnerId: l1.id, type: "REVIEW", title: "12-week progress review", details: "On track. Line manager confirmed OTJ diary.", percent: 18, occurredAt: new Date("2026-04-02"), recordedById: tutor.id },
      { learnerId: l1.id, type: "OTJ", title: "OTJ block — SQL & dashboards", hours: 28, occurredAt: new Date("2026-05-14"), recordedById: tutor.id },
      { learnerId: l1.id, type: "MILESTONE", title: "KSB mapping workshop", percent: 25, occurredAt: new Date("2026-06-20"), recordedById: tutor.id },
      { learnerId: l2.id, type: "REVIEW", title: "Missed 8-week review", details: "Learner did not attend. Line manager chasing.", occurredAt: new Date("2026-07-03"), recordedById: tutor.id },
      { learnerId: l2.id, type: "OTJ", title: "OTJ hours logged", hours: 12, occurredAt: new Date("2026-07-18"), recordedById: tutor.id },
      { learnerId: l5.id, type: "ATTENDANCE", title: "Last taught session", occurredAt: new Date("2026-06-02"), recordedById: tutor.id },
    ],
  });

  await prisma.anomaly.createMany({
    data: [
      {
        learnerId: l2.id,
        type: "OTJ_SHORTFALL",
        severity: "HIGH",
        title: "Off-the-job hours well behind expected",
        description: "Omar has 40h logged against an expected ~180h at this point in ST0118.",
        status: "INVESTIGATING",
        ownerId: tutor.id,
      },
      {
        learnerId: l2.id,
        type: "MISSED_REVIEW",
        severity: "MEDIUM",
        title: "Two consecutive progress reviews missed",
        description: "Reviews on 3 Jul and 8 Aug 2026 were not completed.",
        status: "OPEN",
        ownerId: tutor.id,
      },
      {
        learnerId: l3.id,
        type: "FUNDING",
        severity: "MEDIUM",
        title: "DAS reservation awaiting employer confirmation",
        description: "Non-levy co-investment reservation is in DAS but BrightPath holder has not confirmed start.",
        status: "OPEN",
        ownerId: recruitment.id,
      },
    ],
  });

  const d1 = await prisma.dropoutCase.create({
    data: {
      learnerId: l2.id,
      status: "AT_RISK",
      reasonDetail: "Workload spike in the Trust BI team; OTJ time not being protected. Learner considering withdrawal.",
      atRiskSince: new Date("2026-07-20"),
      assignedToId: recruitment.id,
    },
  });
  const d2 = await prisma.dropoutCase.create({
    data: {
      learnerId: l5.id,
      status: "WITHDRAWN",
      ilrReasonCode: "07",
      reasonDetail: "Withdrew citing caring responsibilities. Employer supportive of a later return.",
      withdrawalDate: new Date("2026-06-12"),
      lastAttendanceAt: new Date("2026-06-02"),
      assignedToId: recruitment.id,
    },
  });

  await prisma.reengagementActivity.createMany({
    data: [
      { dropoutCaseId: d1.id, type: "CALL", summary: "Spoke with Omar. Wants to stay if OTJ time is rostered.", outcome: "SPOKE", occurredAt: new Date("2026-07-22"), performedById: recruitment.id },
      { dropoutCaseId: d1.id, type: "EMPLOYER_CONTACT", summary: "Natalie Brooks agreed to protect Wednesday mornings for OTJ.", outcome: "EMPLOYER_SUPPORTING", occurredAt: new Date("2026-07-24"), performedById: recruitment.id },
      { dropoutCaseId: d1.id, type: "EMAIL", summary: "Sent catch-up plan and next review date.", outcome: "COMMITTED_RETURN", occurredAt: new Date("2026-08-01"), performedById: tutor.id },
      { dropoutCaseId: d2.id, type: "EMAIL", summary: "First re-engagement email after withdrawal.", outcome: "NO_RESPONSE", occurredAt: new Date("2026-06-20"), performedById: recruitment.id },
      { dropoutCaseId: d2.id, type: "CALL", summary: "Left voicemail and texted line manager.", outcome: "LEFT_MESSAGE", occurredAt: new Date("2026-07-04"), performedById: recruitment.id },
      { dropoutCaseId: d2.id, type: "WELLBEING", summary: "Offered a January 2027 restart with part-time OTJ pattern.", outcome: "SPOKE", occurredAt: new Date("2026-08-12"), performedById: recruitment.id },
    ],
  });

  await prisma.emailTemplate.createMany({
    data: [
      {
        name: "Prospect acknowledgement",
        category: "RECRUITMENT",
        subject: "Thanks for your Training in Data apprenticeship enquiry, {{firstName}}",
        body: "Hello {{firstName}},\n\nThank you for applying to a UK Government-funded apprenticeship with Training in Data. We will contact your line manager and your employer’s DAS account holder as part of enrolment.\n\nReference: {{reference}}\n\nTraining in Data\nPaddington Station, London",
      },
      {
        name: "Line manager introduction",
        category: "RECRUITMENT",
        subject: "Line manager role for {{firstName}}’s apprenticeship",
        body: "Dear {{lineManagerName}},\n\n{{firstName}} {{lastName}} is joining a Training in Data apprenticeship with {{organisation}}. As workplace line manager you will protect off-the-job time and join progress reviews.\n\nThank you,\nTraining in Data",
      },
      {
        name: "DAS holder onboarding",
        category: "EMPLOYER",
        subject: "Digital Apprenticeship Service next steps — {{organisation}}",
        body: "Hello {{firstName}},\n\nPlease confirm the DAS reservation and (if levy) the payment of the training from your apprenticeship service account.\n\nTraining in Data",
      },
      {
        name: "Progress review invitation",
        category: "PROGRESS",
        subject: "Progress review for {{firstName}} {{lastName}}",
        body: "Please join the tripartite progress review for {{programme}}. Off-the-job hours and any anomalies will be discussed.\n\nTraining in Data",
      },
      {
        name: "Dropout re-engagement",
        category: "REENGAGEMENT",
        subject: "We’d like to help you continue, {{firstName}}",
        body: "Hello {{firstName}},\n\nWe know things at {{organisation}} may be difficult right now. Training in Data can look at a break in learning, a reduced OTJ pattern, or a later restart so you do not lose your apprenticeship.\n\nYour line manager {{lineManagerName}} is copied.\n\nPlease reply or call us.\n\nTraining in Data",
      },
      {
        name: "Welcome back",
        category: "REENGAGEMENT",
        subject: "Welcome back to your apprenticeship, {{firstName}}",
        body: "Great news — we have recorded your return to programme. Your next review and OTJ plan are in the CRM.\n\nTraining in Data",
      },
      {
        name: "Privacy notice / consent",
        category: "GDPR",
        subject: "Training in Data privacy notice ({{reference}})",
        body: "Please read our privacy notice. We process apprenticeship data under contract and legal obligation (ESFA/ILR). Marketing is optional.\n\nVersion " + BRAND.privacyNoticeVersion,
      },
      {
        name: "Data rights acknowledgement",
        category: "GDPR",
        subject: "We have received your data-rights request",
        body: "We will respond within one month. If you asked for erasure we may need to retain anonymised ILR evidence where the law requires it.\n\nTraining in Data",
      },
    ],
  });

  const reengage = await prisma.emailTemplate.findFirst({ where: { name: "Dropout re-engagement" } });
  await prisma.emailMessage.create({
    data: {
      templateId: reengage?.id,
      toAddresses: encrypt("omar.hassan@camdencare.example"),
      ccAddresses: encrypt("natalie.brooks@camdencare.example"),
      subject: "We’d like to help you continue, Omar",
      body: encrypt("Simulated re-engagement email stored encrypted in the outbox."),
      status: "SIMULATED",
      relatedType: "DropoutCase",
      relatedId: d1.id,
      sentAt: new Date("2026-08-01"),
      createdById: recruitment.id,
    },
  });

  const erasure = await prisma.gdprRequest.create({
    data: {
      reference: "DSR-2026-0001",
      type: "ERASURE",
      status: "ID_VERIFIED",
      subjectName: "Jordan Miles",
      subjectEmail: encrypt("jordan.miles@example.com"),
      subjectEmailHash: hmacIndex("jordan.miles@example.com"),
      receivedAt: new Date("2026-08-20"),
      dueAt: new Date("2026-09-19"),
      identityVerified: true,
      notes: "Former prospect. Never enrolled. Requested deletion of enquiry data.",
      assignedToId: compliance.id,
    },
  });
  await prisma.removalRecord.create({
    data: {
      gdprRequestId: erasure.id,
      subjectNameSnapshot: "Jordan Miles",
      subjectEmailHash: hmacIndex("jordan.miles@example.com"),
      requestedAt: new Date("2026-08-20"),
      status: "REQUESTED",
    },
  });
  await prisma.gdprRequest.create({
    data: {
      reference: "DSR-2026-0002",
      type: "ACCESS",
      status: "IN_PROGRESS",
      subjectName: "Amelia Chen",
      subjectEmail: encrypt("amelia.chen@northwind.example"),
      subjectEmailHash: hmacIndex("amelia.chen@northwind.example"),
      learnerId: l1.id,
      receivedAt: new Date("2026-08-18"),
      dueAt: new Date("2026-09-17"),
      identityVerified: true,
      assignedToId: compliance.id,
    },
  });

  await prisma.task.createMany({
    data: [
      { title: "Protect Omar’s OTJ Wednesdays", details: "Confirm roster with Natalie Brooks.", dueAt: new Date("2026-09-02"), status: "OPEN", relatedType: "DropoutCase", relatedId: d1.id, assigneeId: recruitment.id },
      { title: "Grace Okafor January restart offer", details: "Follow up re-engagement after 12 Aug call.", dueAt: new Date("2026-09-05"), status: "OPEN", relatedType: "DropoutCase", relatedId: d2.id, assigneeId: recruitment.id },
      { title: "Complete Jordan Miles erasure", details: "Identity verified. Process removal register.", dueAt: new Date("2026-09-19"), status: "OPEN", relatedType: "GdprRequest", relatedId: erasure.id, assigneeId: compliance.id },
      { title: "BrightPath DAS confirmation", details: "Sofia Mendes to confirm reservation for Freya Patel.", dueAt: new Date("2026-09-01"), status: "OPEN", relatedType: "Learner", relatedId: l3.id, assigneeId: recruitment.id },
    ],
  });

  await prisma.note.create({
    data: {
      body: "Marcus Reid is an experienced line manager; first review completed on time.",
      relatedType: "Learner",
      relatedId: l1.id,
      learnerId: l1.id,
      authorId: tutor.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      actorEmail: admin.email,
      action: "SEED",
      entityType: "System",
      metadata: JSON.stringify({ notice: BRAND.privacyNoticeVersion }),
    },
  });

  console.log("Seeded Training in Data CRM. Staff login: admin@trainingindata.com / Apprentice!2026");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
