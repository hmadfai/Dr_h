import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Field, TextArea, Badge } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { addTaskAction, completeTaskAction } from "@/app/actions";
import { formatDate } from "@/lib/format";

export default async function TasksPage() {
  const tasks = await prisma.task.findMany({ orderBy: [{ status: "asc" }, { dueAt: "asc" }] });
  return (
    <div>
      <PageHeader title="Tasks" description="Follow-ups for recruitment, reviews, re-engagement and GDPR deadlines." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <ul className="space-y-3">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 rounded-lg border border-tid-line p-3">
                <div>
                  <p className="font-medium">{t.title}</p>
                  {t.details ? <p className="text-sm text-neutral-600">{t.details}</p> : null}
                  <p className="text-xs text-neutral-500">Due {formatDate(t.dueAt)}</p>
                </div>
                {t.status === "OPEN" ? (
                  <form action={completeTaskAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="text-sm text-tid-accent hover:underline">Complete</button>
                  </form>
                ) : (
                  <Badge tone="green">Done</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">New task</h2>
          <ActionForm action={addTaskAction} submitLabel="Create task" className="space-y-3">
            <Field label="Title" name="title" required />
            <TextArea label="Details" name="details" rows={3} />
            <Field label="Due" name="dueAt" type="date" />
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
