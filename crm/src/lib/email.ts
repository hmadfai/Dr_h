import nodemailer from "nodemailer";
import { prisma } from "./prisma";
import { decrypt, encrypt } from "./crypto";
import { writeAudit } from "./audit";

export type TemplateVars = Record<string, string | number | null | undefined>;

export function renderTemplate(template: string, vars: TemplateVars) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    return value == null ? "" : String(value);
  });
}

export async function getSmtpConfig() {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: ["smtpHost", "smtpPort", "smtpUser", "smtpPass", "smtpFrom"] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.key === "smtpPass" ? decrypt(r.value) : r.value]));
  return {
    host: map.smtpHost || process.env.SMTP_HOST || "",
    port: Number(map.smtpPort || process.env.SMTP_PORT || 587),
    user: map.smtpUser || process.env.SMTP_USER || "",
    pass: map.smtpPass || process.env.SMTP_PASS || "",
    from: map.smtpFrom || process.env.SMTP_FROM || "Training in Data CRM <crm@trainingindata.com>",
  };
}

export async function sendEmail(opts: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  templateId?: string;
  relatedType?: string;
  relatedId?: string;
  createdById?: string;
}) {
  const smtp = await getSmtpConfig();
  const record = await prisma.emailMessage.create({
    data: {
      templateId: opts.templateId ?? null,
      toAddresses: encrypt(opts.to),
      ccAddresses: opts.cc ? encrypt(opts.cc) : null,
      subject: opts.subject,
      body: encrypt(opts.body),
      status: "QUEUED",
      relatedType: opts.relatedType ?? null,
      relatedId: opts.relatedId ?? null,
      createdById: opts.createdById ?? null,
    },
  });

  try {
    if (!smtp.host) {
      await prisma.emailMessage.update({
        where: { id: record.id },
        data: { status: "SIMULATED", sentAt: new Date() },
      });
      await writeAudit({
        actorId: opts.createdById,
        action: "EMAIL_SIMULATED",
        entityType: "EmailMessage",
        entityId: record.id,
        metadata: { to: opts.to, subject: opts.subject },
      });
      return { id: record.id, status: "SIMULATED" as const };
    }

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    });
    await transporter.sendMail({
      from: smtp.from,
      to: opts.to,
      cc: opts.cc || undefined,
      subject: opts.subject,
      text: opts.body,
    });
    await prisma.emailMessage.update({
      where: { id: record.id },
      data: { status: "SENT", sentAt: new Date() },
    });
    await writeAudit({
      actorId: opts.createdById,
      action: "EMAIL_SENT",
      entityType: "EmailMessage",
      entityId: record.id,
      metadata: { to: opts.to, subject: opts.subject },
    });
    return { id: record.id, status: "SENT" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown mail error";
    await prisma.emailMessage.update({
      where: { id: record.id },
      data: { status: "FAILED", error: message },
    });
    return { id: record.id, status: "FAILED" as const, error: message };
  }
}

export function decryptEmail(row: { toAddresses: string; ccAddresses: string | null; body: string; subject: string; status: string; sentAt: Date | null; createdAt: Date; id: string; relatedType: string | null; relatedId: string | null }) {
  return {
    ...row,
    toAddresses: decrypt(row.toAddresses),
    ccAddresses: decrypt(row.ccAddresses),
    body: decrypt(row.body),
  };
}
