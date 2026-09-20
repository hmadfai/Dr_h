import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, Field, TextArea } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { saveProgrammeAction } from "@/app/actions";

export default async function ProgrammesPage() {
  const programmes = await prisma.programme.findMany({
    include: { _count: { select: { learners: true } } },
    orderBy: { name: "asc" },
  });
  return (
    <div>
      <PageHeader
        title="Apprenticeship programmes"
        description="IfATE / ESFA standards delivered by Training in Data, with funding band and off-the-job hour targets."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {programmes.map((p) => (
          <Card key={p.id}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{p.name}</h2>
                <p className="text-sm text-neutral-600">
                  {p.standardCode} · Level {p.level} · {p.durationMonths} months
                </p>
              </div>
              <Badge>{p._count.learners} people</Badge>
            </div>
            <p className="mb-4 text-sm text-neutral-600">{p.description}</p>
            <ActionForm action={saveProgrammeAction} submitLabel="Save" className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={p.id} />
              <Field label="Name" name="name" required defaultValue={p.name} />
              <Field label="Standard code" name="standardCode" required defaultValue={p.standardCode} />
              <Field label="Level" name="level" type="number" required defaultValue={p.level} />
              <Field label="Duration (months)" name="durationMonths" type="number" required defaultValue={p.durationMonths} />
              <Field label="Funding band max (£)" name="fundingBandMax" type="number" defaultValue={p.fundingBandMax} />
              <Field label="OTJ hours target" name="otjHoursTarget" type="number" defaultValue={p.otjHoursTarget} />
              <Field label="EPAO" name="epao" defaultValue={p.epao} />
              <div className="sm:col-span-2">
                <TextArea label="Description" name="description" defaultValue={p.description} rows={3} />
              </div>
            </ActionForm>
          </Card>
        ))}
        <Card>
          <h2 className="mb-3 font-semibold">Add programme</h2>
          <ActionForm action={saveProgrammeAction} submitLabel="Create programme" className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" name="name" required />
            <Field label="Standard code" name="standardCode" required placeholder="ST0118" />
            <Field label="Level" name="level" type="number" required />
            <Field label="Duration (months)" name="durationMonths" type="number" required />
            <Field label="Funding band max (£)" name="fundingBandMax" type="number" />
            <Field label="OTJ hours target" name="otjHoursTarget" type="number" required />
            <Field label="EPAO" name="epao" />
            <div className="sm:col-span-2">
              <TextArea label="Description" name="description" rows={3} />
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
