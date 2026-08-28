import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, statusTone, Field, SelectField, TextArea } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { sendTemplatedEmailAction } from "@/app/actions";
import { decryptEmail } from "@/lib/email";
import { formatDateTime } from "@/lib/format";
import { getSmtpConfig } from "@/lib/email";

export default async function EmailPage() {
  const [templates, messages, smtp] = await Promise.all([
    prisma.emailTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.emailMessage.findMany({ orderBy: { createdAt: "desc" }, take: 40 }),
    getSmtpConfig(),
  ]);

  return (
    <div>
      <PageHeader
        title="Email"
        description={
          smtp.host
            ? `Connected to SMTP host ${smtp.host}:${smtp.port}. Messages are encrypted in the outbox.`
            : "SMTP is not configured yet — messages are stored encrypted in the outbox as simulated sends. Add host details under Settings."
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Compose</h2>
          <ActionForm action={sendTemplatedEmailAction} submitLabel="Send email" className="space-y-3">
            <SelectField
              label="Template"
              name="templateId"
              options={templates.map((t) => ({ value: t.id, label: `${t.name} (${t.category})` }))}
            />
            <Field label="To" name="to" type="email" required />
            <Field label="Cc" name="cc" />
            <Field label="Subject override" name="subject" hint="Leave blank to use the template subject" />
            <TextArea label="Body override" name="body" rows={10} />
            <Field label="var_firstName" name="var_firstName" />
            <Field label="var_organisation" name="var_organisation" />
          </ActionForm>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Templates</h2>
          <ul className="space-y-3 text-sm">
            {templates.map((t) => (
              <li key={t.id} className="rounded-lg border border-tid-line p-3">
                <div className="font-medium">{t.name}</div>
                <div className="text-xs uppercase text-neutral-500">{t.category}</div>
                <p className="mt-1 text-neutral-600">{t.subject}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="mt-6">
        <h2 className="mb-3 font-semibold">Outbox (encrypted at rest)</h2>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-tid-line text-xs uppercase text-neutral-500">
            <tr>
              <th className="py-2 pr-3">When</th>
              <th className="py-2 pr-3">To</th>
              <th className="py-2 pr-3">Subject</th>
              <th className="py-2 pr-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((m) => {
              const d = decryptEmail(m);
              return (
                <tr key={m.id} className="border-b border-tid-line/60">
                  <td className="py-2 pr-3">{formatDateTime(m.sentAt ?? m.createdAt)}</td>
                  <td className="py-2 pr-3">{d.toAddresses}</td>
                  <td className="py-2 pr-3">{d.subject}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={statusTone(m.status)}>{m.status}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
