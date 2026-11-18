"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { generateApplication } from "@/lib/services/generation";
import { createWorkspace } from "@/lib/repo/workspaces";
import type { FormState } from "@/lib/form-state";

const createAppSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(8, "Describe the application in a sentence.")
    .max(600, "Keep the description under 600 characters."),
  name: z.string().trim().max(60).optional(),
  workspaceId: z.string().min(3),
});

export async function createApplicationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = createAppSchema.safeParse({
    prompt: formData.get("prompt"),
    name: formData.get("name") || undefined,
    workspaceId: formData.get("workspaceId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  let appId: string;
  try {
    const result = generateApplication({
      userId: user.id,
      workspaceId: parsed.data.workspaceId,
      prompt: parsed.data.prompt,
      name: parsed.data.name,
    });
    appId = result.app.id;
  } catch (error) {
    if (error instanceof HttpError) return { error: error.message };
    console.error("[generate]", error);
    return { error: "The application could not be generated. Try again." };
  }

  revalidatePath("/dashboard");
  redirect(`/apps/${appId}`);
}

const workspaceSchema = z.object({
  name: z.string().trim().min(2, "Give the workspace a name.").max(60),
});

export async function createWorkspaceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = workspaceSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  try {
    createWorkspace(user.id, parsed.data.name);
  } catch (error) {
    console.error("[workspace]", error);
    return { error: "Could not create the workspace." };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}
