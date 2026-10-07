import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Field } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { saveSmtpAction } from "@/app/actions";
import { getSmtpConfig } from "@/lib/email";
import { BRAND } from "@/lib/constants";
import { requireUser } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await requireUser();
  const smtp = await getSmtpConfig();
  const notice = await prisma.appSetting.findUnique({ where: { key: "privacyNoticeVersion" } });

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Encryption keys are loaded from environment variables and never shown here. SMTP credentials are stored encrypted."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">Email (SMTP)</h2>
          {user.role !== "ADMIN" ? (
            <p className="text-sm text-neutral-600">Only administrators can change mail settings. Current host: {smtp.host || "not configured (simulated outbox)"}.</p>
          ) : (
            <ActionForm action={saveSmtpAction} submitLabel="Save SMTP" className="space-y-3">
              <Field label="Host" name="smtpHost" defaultValue={smtp.host} placeholder="smtp.office365.com" />
              <Field label="Port" name="smtpPort" defaultValue={String(smtp.port)} />
              <Field label="Username" name="smtpUser" defaultValue={smtp.user} />
              <Field label="Password" name="smtpPass" type="password" hint="Leave blank to keep the stored password" />
              <Field label="From address" name="smtpFrom" defaultValue={smtp.from} />
            </ActionForm>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">GDPR controls</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-neutral-500">Privacy notice version</dt>
              <dd className="font-medium">{notice?.value || BRAND.privacyNoticeVersion}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Field encryption</dt>
              <dd className="font-medium">AES-256-GCM · HMAC-SHA256 search indexes</dd>
            </div>
            <div>
              <dt className="text-neutral-500">SAR deadline</dt>
              <dd className="font-medium">30 calendar days from receipt</dd>
            </div>
            <div>
              <dt className="text-neutral-500">ILR retention</dt>
              <dd className="font-medium">Anonymised funding evidence retained for ESFA audit (current year + 6)</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
