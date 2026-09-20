import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { learnerPortableRecord } from "@/lib/gdpr";
import { writeAudit } from "@/lib/audit";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const learner = await prisma.learner.findUnique({
    where: { id: params.id },
    include: { organisation: true, programme: true, consents: true, progress: true },
  });
  if (!learner) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "GDPR_EXPORT",
    entityType: "Learner",
    entityId: learner.id,
  });
  const payload = learnerPortableRecord(learner);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${learner.reference}-gdpr-export.json"`,
    },
  });
}
