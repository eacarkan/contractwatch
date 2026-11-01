"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { FormState } from "@/components/action-form";
import { GATE_COOKIE, gateToken, safeReturnPath } from "@/lib/demo-gate";
import { getEnv } from "@/lib/env";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function enter(
  fallback: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const { DEMO_PASSWORD } = getEnv();
  if (DEMO_PASSWORD && formData.get("password") !== DEMO_PASSWORD) {
    return { error: "wrongPassword" };
  }

  if (DEMO_PASSWORD) {
    (await cookies()).set(GATE_COOKIE, await gateToken(DEMO_PASSWORD), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: THIRTY_DAYS,
      path: "/",
    });
  }
  redirect(safeReturnPath(formData.get("next"), fallback));
}
