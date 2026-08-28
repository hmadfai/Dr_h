"use client";

import { useFormState, useFormStatus } from "react-dom";
import { loginAction, type ActionState } from "@/app/actions";
import { Logo } from "@/components/logo";
import Link from "next/link";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-tid-navy hover:bg-tid-muted disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export default function LoginPage() {
  const [state, action] = useFormState(loginAction, null as ActionState);
  return (
    <div className="flex min-h-screen flex-col bg-tid-navy text-white">
      <header className="flex items-center justify-between px-8 py-6">
        <Logo />
        <Link href="/privacy" className="text-sm text-white/80 hover:text-white">
          Privacy & GDPR
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md rounded-2xl bg-white/10 p-8 shadow-xl ring-1 ring-white/15 backdrop-blur">
          <h1 className="text-2xl font-semibold">Staff sign in</h1>
          <p className="mt-2 text-sm text-white/75">
            Training in Data apprenticeship CRM — student recruitment, DAS employers, progress and UK GDPR controls.
          </p>
          <form action={action} className="mt-6 space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block">Work email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
                defaultValue="admin@trainingindata.com"
                className="w-full rounded-lg border-0 px-3 py-2 text-tid-ink outline-none ring-2 ring-transparent focus:ring-white"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block">Password</span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                defaultValue="Apprentice!2026"
                className="w-full rounded-lg border-0 px-3 py-2 text-tid-ink outline-none ring-2 ring-transparent focus:ring-white"
              />
            </label>
            {state?.error ? <p className="text-sm text-red-200">{state.error}</p> : null}
            <Submit />
          </form>
          <p className="mt-6 text-xs leading-5 text-white/65">
            Access is limited to authorised Training in Data staff. Sign-in, learner files and emails are audited. Personal
            data is encrypted at rest. By signing in you confirm you will only process data for apprenticeship delivery and
            recruitment in line with the privacy notice.
          </p>
        </div>
      </main>
    </div>
  );
}
