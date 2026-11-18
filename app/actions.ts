"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { endSession, requireUser, startSession, verifyPassword } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { generateApplication } from "@/lib/services/generation";
import { createUser, findUserByEmail } from "@/lib/repo/users";
import { createWorkspace } from "@/lib/repo/workspaces";
import type { FormState } from "@/lib/form-state";

const signupSchema = z.object({
  name: z.string().trim().min(2, "Tell us your name.").max(60),
  email: z.string().trim().email("Use a valid email address.").max(160),
  password: z.string().min(8, "Use at least 8 characters.").max(200),
});

const loginSchema = z.object({
  email: z.string().trim().email("Use a valid email address.").max(160),
  password: z.string().min(1, "Enter your password."),
});

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  let userId: string;
  try {
    const user = createUser(parsed.data);
    userId = user.id;
    createWorkspace(user.id, `${user.name.split(" ")[0]}'s workspace`);
  } catch (error) {
    if (error instanceof HttpError) return { error: error.message };
    console.error("[signup]", error);
    return { error: "Could not create the account. Try again." };
  }

  await startSession(userId);
  redirect("/dashboard");
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const user = findUserByEmail(parsed.data.email);
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return { error: "Email or password is incorrect." };
  }

  await startSession(user.id);
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

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
