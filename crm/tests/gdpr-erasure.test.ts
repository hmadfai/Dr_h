import { beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

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

const enabled = Boolean(process.env.ENCRYPTION_KEY && process.env.HMAC_KEY && process.env.DATABASE_URL);

describe.skipIf(!enabled)("GDPR erasure and suppression", () => {
  beforeAll(async () => {
    await import("../src/lib/crypto");
  });

  it("anonymises a prospect and blocks re-import via the removal register", async () => {
    const { prisma } = await import("../src/lib/prisma");
    const { encrypt, hmacIndex, decrypt } = await import("../src/lib/crypto");
    const { processErasure, isSuppressed } = await import("../src/lib/gdpr");

    const org = await prisma.organisation.findFirst();
    expect(org).toBeTruthy();
    const email = `erase-me-${Date.now()}@example.com`;
    const learner = await prisma.learner.create({
      data: {
        reference: `TID-TEST-${Date.now()}`,
        firstName: "Jordan",
        lastName: "Miles",
        email: encrypt(email),
        emailHash: hmacIndex(email),
        organisationId: org!.id,
        lineManagerName: "Alex Fox",
        lineManagerJobTitle: "Lead",
        lineManagerEmail: encrypt("alex.fox@example.com"),
        lineManagerPhone: encrypt("07700900000"),
        status: "PROSPECT",
        pipelineStage: "ENQUIRY",
      },
    });
    const request = await prisma.gdprRequest.create({
      data: {
        reference: `DSR-TEST-${Date.now()}`,
        type: "ERASURE",
        status: "ID_VERIFIED",
        subjectName: "Jordan Miles",
        subjectEmail: encrypt(email),
        subjectEmailHash: hmacIndex(email),
        learnerId: learner.id,
        dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        identityVerified: true,
      },
    });

    const result = await processErasure({
      requestId: request.id,
      actorId: "test",
      actorEmail: "compliance@trainingindata.com",
    });
    expect(result.enrolled).toBe(false);

    const updated = await prisma.learner.findUnique({ where: { id: learner.id } });
    expect(updated?.firstName).toBe("Redacted");
    expect(updated?.status).toBe("ERASED");
    expect(decrypt(updated!.email)).not.toBe(email);
    expect(await isSuppressed(email)).toBe(true);
  });
});
