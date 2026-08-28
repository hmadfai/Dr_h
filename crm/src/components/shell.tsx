import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { Logo } from "./logo";
import type { SessionUser } from "@/lib/auth";
import type { ReactNode } from "react";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/pipeline", label: "Recruitment pipeline" },
  { href: "/learners", label: "Learners & prospects" },
  { href: "/organisations", label: "Organisations" },
  { href: "/programmes", label: "Programmes" },
  { href: "/progress", label: "Progress" },
  { href: "/anomalies", label: "Anomalies" },
  { href: "/dropouts", label: "Dropouts & return" },
  { href: "/email", label: "Email" },
  { href: "/gdpr", label: "GDPR & rights" },
  { href: "/tasks", label: "Tasks" },
  { href: "/reports", label: "Reports" },
  { href: "/audit", label: "Audit log" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-tid-muted">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-tid-navy text-white">
        <div className="border-b border-white/10 px-4 py-5">
          <Logo />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="mb-0.5 block rounded-lg px-3 py-2 text-sm text-white/85 hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-white/10 px-4 py-4 text-xs text-white/70">
          <p className="font-medium text-white">{user.name}</p>
          <p className="truncate">{user.email}</p>
          <p className="mt-1 uppercase tracking-wide">{user.role.replaceAll("_", " ")}</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-tid-line bg-white px-6 py-3">
          <form action="/search" className="w-full max-w-xl">
            <input
              name="q"
              placeholder="Search learners, organisations, DAS holders…"
              className="w-full rounded-lg border border-tid-line px-3 py-2 text-sm outline-none ring-tid-accent/30 focus:ring-2"
            />
          </form>
          <form action={logoutAction}>
            <button type="submit" className="ml-4 text-sm font-medium text-tid-navy hover:underline">
              Sign out
            </button>
          </form>
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
