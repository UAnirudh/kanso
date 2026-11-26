"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signInAction, signUpAction } from "@/app/actions";
import type { FormState } from "@/lib/form-state";

// Mirrors MIN_PASSWORD_LENGTH in lib/repo/accounts.ts; that module touches the
// database and must not be pulled into the client bundle.
const MIN_PASSWORD_LENGTH = 8;

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function Error({ state }: { state: FormState }) {
  return state.error ? (
    <p role="alert" className="mt-2 text-[12px] text-red-300">
      {state.error}
    </p>
  ) : null;
}

export function SignUpForm({ defaultName }: { defaultName?: string }) {
  const [state, action] = useActionState(signUpAction, {} as FormState);

  return (
    <form action={action} className="mt-4">
      <label className="label" htmlFor="signup-name">
        Name (optional)
      </label>
      <input
        id="signup-name"
        name="name"
        className="field"
        defaultValue={defaultName}
        maxLength={60}
        autoComplete="name"
        placeholder="Your name"
      />

      <label className="label mt-3" htmlFor="signup-email">
        Email
      </label>
      <input
        id="signup-email"
        name="email"
        type="email"
        className="field"
        required
        autoComplete="email"
        placeholder="you@example.com"
      />

      <label className="label mt-3" htmlFor="signup-password">
        Password
      </label>
      <input
        id="signup-password"
        name="password"
        type="password"
        className="field"
        required
        minLength={MIN_PASSWORD_LENGTH}
        autoComplete="new-password"
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
      />
      <Error state={state} />

      <div className="mt-4">
        <Submit label="Create account" pendingLabel="Creating account…" />
      </div>
    </form>
  );
}

export function SignInForm() {
  const [state, action] = useActionState(signInAction, {} as FormState);

  return (
    <form action={action} className="mt-4">
      <label className="label" htmlFor="signin-email">
        Email
      </label>
      <input
        id="signin-email"
        name="email"
        type="email"
        className="field"
        required
        autoComplete="email"
        placeholder="you@example.com"
      />

      <label className="label mt-3" htmlFor="signin-password">
        Password
      </label>
      <input
        id="signin-password"
        name="password"
        type="password"
        className="field"
        required
        autoComplete="current-password"
        placeholder="Your password"
      />
      <Error state={state} />

      <div className="mt-4">
        <Submit label="Sign in" pendingLabel="Signing in…" />
      </div>
    </form>
  );
}
