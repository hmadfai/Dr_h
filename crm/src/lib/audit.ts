import { prisma } from "./prisma";

export async function writeAudit(entry: {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
  ip?: string | null;
}) {
  await prisma.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      actorEmail: entry.actorEmail ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      ip: entry.ip ?? null,
    },
  });
}
