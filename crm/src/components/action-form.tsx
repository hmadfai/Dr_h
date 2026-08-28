"use client";

import { useFormState, useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";
import type { ReactNode } from "react";

function Submit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center rounded-lg bg-tid-navy px-3.5 py-2 text-sm font-medium text-white hover:bg-tid-navyDark disabled:opacity-60"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

export function ActionForm({
  action,
  children,
  submitLabel,
  className,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
}) {
  const [state, formAction] = useFormState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>
      ) : null}
      {state?.ok ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.ok}</p>
      ) : null}
      <Submit>{submitLabel}</Submit>
    </form>
  );
}
