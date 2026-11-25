"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  SESSION_COOKIE,
  getViewer,
  requireGuest,
  sessionCookieOptions,
} from "@/lib/identity";
import {
  assertSignInAllowed,
  assertSignUpAllowed,
  authenticate,
  claimAccount,
  createSession,
  pruneExpiredSessions,
  revokeSession,
} from "@/lib/repo/accounts";
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

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters."),
  name: z.string().trim().max(60).optional(),
});

async function startSession(userId: string): Promise<void> {
  const ticket = createSession(userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, ticket.token, sessionCookieOptions());
}

/**
 * Claims the browser's guest identity, so signing up keeps the interface
 * documents and workspace role it already has instead of starting empty.
 */
export async function signUpAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    assertSignUpAllowed(parsed.data.email);
  } catch (error) {
    if (error instanceof HttpError) return { error: error.message };
    throw error;
  }

  const viewer = await getViewer();
  let userId: string;
  try {
    userId = claimAccount({
      userId: viewer?.id ?? null,
      email: parsed.data.email,
      password: parsed.data.password,
      name: parsed.data.name,
    }).id;
  } catch (error) {
    if (error instanceof HttpError) return { error: error.message };
    console.error("[sign-up]", error);
    return { error: "The account could not be created. Try again." };
  }

  await startSession(userId);
  pruneExpiredSessions();
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function signInAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = credentialsSchema.pick({ email: true, password: true }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  // Counted before verification, so a burst of guesses is throttled whether or
  // not any of them would have matched.
  try {
    assertSignInAllowed(parsed.data.email);
  } catch (error) {
    if (error instanceof HttpError) return { error: error.message };
    throw error;
  }

  const account = authenticate(parsed.data.email, parsed.data.password);
  if (!account) {
    // One message for both cases, so the form cannot be used to enumerate emails.
    return { error: "That email and password do not match an account." };
  }

  await startSession(account.id);
  pruneExpiredSessions();
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/**
 * Ends this browser's session. The claimed row keeps its credentials and its
 * data; the device cookie no longer resolves to it, so the next request mints a
 * fresh guest rather than quietly staying signed in.
 */
export async function signOutAction(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) revokeSession(token);
  // Overwrite rather than `delete`: the redirect below must not be able to leave
  // a live session cookie behind while the dashboard is still cached as signed
  // in. Revalidating the layout drops that cached render, so the new guest
  // identity appears on the first frame instead of after a manual reload.
  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

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
