import Link from "next/link";
import { type ReactNode } from "react";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-tid-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-neutral-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-tid-line bg-white p-5 shadow-sm", className)}>{children}</section>;
}

export function Button({
  children,
  href,
  variant = "primary",
  type = "button",
  className,
}: {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  type?: "button" | "submit";
  className?: string;
}) {
  const styles = {
    primary: "bg-tid-navy text-white hover:bg-tid-navyDark",
    secondary: "bg-white text-tid-navy border border-tid-navy/20 hover:bg-tid-muted",
    ghost: "text-tid-navy hover:bg-tid-navy/5",
    danger: "bg-red-700 text-white hover:bg-red-800",
  }[variant];
  const cls = cn("inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium transition", styles, className);
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button type={type} className={cls}>
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "navy",
}: {
  children: ReactNode;
  tone?: "navy" | "blue" | "green" | "amber" | "red" | "slate";
}) {
  const cls = {
    navy: "bg-tid-navy/10 text-tid-navy",
    blue: "bg-tid-accent/10 text-tid-accent",
    green: "bg-emerald-50 text-emerald-800",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-800",
    slate: "bg-neutral-100 text-neutral-700",
  }[tone];
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", cls)}>{children}</span>;
}

export function statusTone(status: string): "navy" | "blue" | "green" | "amber" | "red" | "slate" {
  const s = status.toUpperCase();
  if (["COMPLETED", "RESOLVED", "RE_ENGAGED", "SENT", "GIVEN", "ENROLLED", "IN_LEARNING"].includes(s)) return "green";
  if (["AT_RISK", "OPEN", "INVESTIGATING", "HIGH", "RECEIVED", "IN_PROGRESS"].includes(s)) return "amber";
  if (["WITHDRAWN", "CRITICAL", "FAILED", "ERASED", "REJECTED"].includes(s)) return "red";
  if (["PROSPECT", "APPLICATION", "SIMULATED"].includes(s)) return "blue";
  return "navy";
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-tid-line px-4 py-10 text-center text-sm text-neutral-500">
      <p className="font-medium text-neutral-700">{title}</p>
      {children}
    </div>
  );
}

export function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number | null;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-tid-ink">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className="w-full rounded-lg border border-tid-line bg-white px-3 py-2 text-sm outline-none ring-tid-accent/30 focus:ring-2"
      />
      {hint ? <span className="mt-1 block text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  name,
  required,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string;
  options: readonly { value: string; label: string }[] | { value: string; label: string }[];
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-tid-ink">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      <select
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-tid-line bg-white px-3 py-2 text-sm outline-none ring-tid-accent/30 focus:ring-2"
      >
        <option value="">Select…</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextArea({
  label,
  name,
  required,
  defaultValue,
  rows = 4,
}: {
  label: string;
  name: string;
  required?: boolean;
  defaultValue?: string | null;
  rows?: number;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-tid-ink">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      <textarea
        name={name}
        required={required}
        defaultValue={defaultValue ?? ""}
        rows={rows}
        className="w-full rounded-lg border border-tid-line bg-white px-3 py-2 text-sm outline-none ring-tid-accent/30 focus:ring-2"
      />
    </label>
  );
}

export function Check({ name, label, defaultChecked, required }: { name: string; label: string; defaultChecked?: boolean; required?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm text-tid-ink">
      <input type="checkbox" name={name} required={required} defaultChecked={defaultChecked} className="mt-1 h-4 w-4 rounded border-tid-line text-tid-navy" />
      <span>{label}</span>
    </label>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-tid-navy">{value}</p>
      {hint ? <p className="mt-1 text-xs text-neutral-500">{hint}</p> : null}
    </Card>
  );
}
