"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireGuest } from "@/lib/identity";
import { HttpError } from "@/lib/errors";
import {
  deleteApplication,
  generateApplication,
  renameApplication,
} from "@/lib/services/generation";
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
  const guest = await requireGuest();
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
      userId: guest.id,
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

const appIdSchema = z.string().trim().min(3).max(80);

/** Management rights are enforced inside the service functions. */
export async function renameApplicationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const guest = await requireGuest();
  const parsed = z
    .object({
      appId: appIdSchema,
      name: z.string().trim().min(2, "Give the application a name.").max(60),
    })
    .safeParse({ appId: formData.get("appId"), name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the name." };
  }

  try {
    renameApplication({
      appId: parsed.data.appId,
      userId: guest.id,
      name: parsed.data.name,
    });
  } catch (error) {
    if (error instanceof HttpError) return { error: error.message };
    console.error("[rename-application]", error);
    return { error: "The application could not be renamed. Try again." };
  }
  revalidatePath("/dashboard");
  revalidatePath(`/apps/${parsed.data.appId}`);
  return { ok: true };
}

export async function deleteApplicationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const guest = await requireGuest();
  const parsed = appIdSchema.safeParse(formData.get("appId"));
  if (!parsed.success) return { error: "That application could not be found." };

  try {
    deleteApplication({ appId: parsed.data, userId: guest.id });
  } catch (error) {
    if (error instanceof HttpError) return { error: error.message };
    console.error("[delete-application]", error);
    return { error: "The application could not be deleted. Try again." };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}

const workspaceSchema = z.object({
  name: z.string().trim().min(2, "Give the workspace a name.").max(60),
});

export async function createWorkspaceAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const guest = await requireGuest();
  const parsed = workspaceSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };

  try {
    createWorkspace(guest.id, parsed.data.name);
  } catch (error) {
    console.error("[workspace]", error);
    return { error: "Could not create the workspace." };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}
