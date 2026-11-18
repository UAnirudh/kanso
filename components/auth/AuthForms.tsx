"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, signupAction } from "@/app/actions";
import type { FormState } from "@/lib/form-state";

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn btn-primary mt-5 w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function ErrorNote({ state }: { state: FormState }) {
  if (!state?.error) return null;
  return (
    <p
      role="alert"
      className="mt-4 rounded-[8px] border border-red-500/25 bg-red-500/10 px-3 py-2 text-[13px] text-red-300"
    >
      {state.error}
    </p>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(loginAction, {});
  return (
    <form action={action} className="mt-7">
      <label className="label" htmlFor="login-email">
        Email
      </label>
      <input
        id="login-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        className="field"
        placeholder="you@company.com"
      />

      <div className="mt-4">
        <label className="label" htmlFor="login-password">
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="field"
          placeholder="••••••••"
        />
      </div>

      <ErrorNote state={state} />
      <SubmitButton label="Sign in" pendingLabel="Signing in…" />
    </form>
  );
}

export function SignupForm() {
  const [state, action] = useActionState(signupAction, {});
  return (
    <form action={action} className="mt-7">
      <label className="label" htmlFor="signup-name">
        Name
      </label>
      <input
        id="signup-name"
        name="name"
        autoComplete="name"
        required
        className="field"
        placeholder="Ada Lovelace"
      />

      <div className="mt-4">
        <label className="label" htmlFor="signup-email">
          Email
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="field"
          placeholder="you@company.com"
        />
      </div>

      <div className="mt-4">
        <label className="label" htmlFor="signup-password">
          Password
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="field"
          placeholder="At least 8 characters"
        />
      </div>

      <ErrorNote state={state} />
      <SubmitButton label="Create account" pendingLabel="Creating…" />
      <p className="mt-3 text-center text-[11px] leading-relaxed text-[#5f626b]">
        We create a private workspace for you. You can invite teammates afterwards.
      </p>
    </form>
  );
}
