import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, statusTone } from "@/components/ui";
import { PIPELINE_STAGES, labelOf, LEARNER_STATUSES } from "@/lib/constants";
import { fullName } from "@/lib/format";
import { movePipelineAction } from "@/app/actions";
import Link from "next/link";

export default async function PipelinePage() {
  const learners = await prisma.learner.findMany({
    where: { status: { notIn: ["ERASED", "COMPLETED"] } },
    include: { organisation: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <PageHeader
        title="Student recruitment pipeline"
        description="Move prospects from enquiry to DAS reservation and enrolment. Line manager and employer DAS data must already be on the record."
      />
      <div className="flex gap-3 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => {
          const cards = learners.filter((l) => l.pipelineStage === stage.value);
          return (
            <Card key={stage.value} className="min-w-[240px] flex-1">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{stage.label}</h2>
                <Badge tone="slate">{cards.length}</Badge>
              </div>
              <div className="space-y-3">
                {cards.map((learner) => (
                  <div key={learner.id} className="rounded-xl border border-tid-line bg-tid-muted p-3 text-sm">
                    <Link href={`/learners/${learner.id}`} className="font-medium text-tid-navy hover:underline">
                      {fullName(learner)}
                    </Link>
                    <p className="text-xs text-neutral-600">{learner.organisation.legalName}</p>
                    <p className="text-xs text-neutral-500">LM {learner.lineManagerName}</p>
                    <div className="mt-2">
                      <Badge tone={statusTone(learner.status)}>{labelOf(LEARNER_STATUSES, learner.status)}</Badge>
                    </div>
                    <form action={movePipelineAction} className="mt-2">
                      <input type="hidden" name="id" value={learner.id} />
                      <select
                        name="pipelineStage"
                        defaultValue={learner.pipelineStage}
                        className="w-full rounded border border-tid-line bg-white px-2 py-1 text-xs"
                      >
                        {PIPELINE_STAGES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="mt-1 text-xs font-medium text-tid-accent hover:underline">
                        Move
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
