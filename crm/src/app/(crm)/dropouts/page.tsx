import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, statusTone, Button } from "@/components/ui";
import { DROPOUT_STATUSES, labelOf } from "@/lib/constants";
import { fullName, formatDate } from "@/lib/format";
import Link from "next/link";

export default async function DropoutsPage() {
  const cases = await prisma.dropoutCase.findMany({
    include: {
      learner: true,
      activities: { orderBy: { occurredAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <div>
      <PageHeader
        title="Dropouts & bringing learners back"
        description="Track at-risk apprentices, withdrawals, and every attempt to re-engage the learner and their line manager."
      />
      <div className="grid gap-4">
        {cases.map((c) => (
          <Card key={c.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/dropouts/${c.id}`} className="text-lg font-semibold text-tid-navy hover:underline">
                  {fullName(c.learner)}
                </Link>
                <p className="text-sm text-neutral-600">{c.reasonDetail}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Opened {formatDate(c.createdAt)}
                  {c.withdrawalDate ? ` · withdrawn ${formatDate(c.withdrawalDate)}` : ""}
                  {c.activities[0]
                    ? ` · last contact ${formatDate(c.activities[0].occurredAt)} (${c.activities[0].outcome.replaceAll("_", " ").toLowerCase()})`
                    : " · no re-engagement logged yet"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(c.status)}>{labelOf(DROPOUT_STATUSES, c.status)}</Badge>
                <Button href={`/dropouts/${c.id}`}>Work the case</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
