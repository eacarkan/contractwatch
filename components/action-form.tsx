"use client";

import { useTranslations } from "next-intl";
import { useActionState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

export type FormState = { error: string | null };

const INITIAL_STATE: FormState = { error: null };

/** A form bound to a server action, showing the error it returns, if any. */
export function ActionForm({
  action,
  submit,
  children,
  className = "grid gap-4",
  variant = "default",
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submit: string;
  children?: ReactNode;
  className?: string;
  variant?: "default" | "outline" | "ghost";
}) {
  const t = useTranslations("FormErrors");
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  return (
    <form action={formAction} className={className}>
      {children}
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {t(state.error)}
        </p>
      )}
      <Button
        type="submit"
        variant={variant}
        disabled={pending}
        className="justify-self-start"
      >
        {submit}
      </Button>
    </form>
  );
}
