import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export default async function AuditPage() {
  const rows = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every sign-in, learner change, email, consent event and GDPR action is recorded for accountability."
      />
      <Card>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-tid-line text-xs uppercase text-neutral-500">
            <tr>
              <th className="py-2 pr-3">When</th>
              <th className="py-2 pr-3">Actor</th>
              <th className="py-2 pr-3">Action</th>
              <th className="py-2 pr-3">Entity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-tid-line/60">
                <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                <td className="py-2 pr-3">{r.actorEmail ?? "system"}</td>
                <td className="py-2 pr-3">{r.action}</td>
                <td className="py-2 pr-3">
                  {r.entityType}
                  {r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
