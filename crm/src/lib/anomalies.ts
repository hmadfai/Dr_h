import { prisma } from "./prisma";

export async function refreshOtjAnomaly(learnerId: string, ownerId?: string) {
  const learner = await prisma.learner.findUnique({ where: { id: learnerId } });
  if (!learner || !learner.startDate || !learner.plannedEndDate || !learner.otjHoursRequired) return;

  const totalMs = learner.plannedEndDate.getTime() - learner.startDate.getTime();
  const elapsedMs = Date.now() - learner.startDate.getTime();
  if (totalMs <= 0 || elapsedMs <= 0) return;
  const expected = Math.round(learner.otjHoursRequired * Math.min(1, elapsedMs / totalMs));
  const shortfall = expected - learner.otjHoursLogged;
  if (shortfall < 20) return;

  const existing = await prisma.anomaly.findFirst({
    where: { learnerId, type: "OTJ_SHORTFALL", status: { in: ["OPEN", "INVESTIGATING"] } },
  });
  const title = `Off-the-job hours ${shortfall} hours behind expected`;
  const description = `Expected ~${expected} OTJ hours by this point in the programme; ${learner.otjHoursLogged} logged (target ${learner.otjHoursRequired}).`;
  if (existing) {
    await prisma.anomaly.update({
      where: { id: existing.id },
      data: { title, description, severity: shortfall > 60 ? "HIGH" : "MEDIUM" },
    });
  } else {
    await prisma.anomaly.create({
      data: {
        learnerId,
        type: "OTJ_SHORTFALL",
        severity: shortfall > 60 ? "HIGH" : "MEDIUM",
        title,
        description,
        status: "OPEN",
        ownerId: ownerId ?? null,
      },
    });
  }
}
