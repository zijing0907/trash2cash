import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { Button, Card, ErrorNote } from "../components/ui";
import { api } from "../lib/api";
import type { User } from "../lib/types";

function useAfterAuth() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next");
  // Only follow local paths, never another site
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/scan";
  return (user: User) => {
    qc.setQueryData(["me"], user);
    void qc.invalidateQueries({ queryKey: ["scans"] });
    navigate(target, { replace: true });
  };
}

function Field(props: {
  label: string;
  type: string;
  name: string;
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  minLength?: number;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{props.label}</span>
      <input
        required
        type={props.type}
        name={props.name}
        autoComplete={props.autoComplete}
        value={props.value}
        minLength={props.minLength}
        onChange={(e) => props.onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border border-line bg-white px-4 py-3 outline-none transition focus:border-leaf-400 focus:ring-4 focus:ring-leaf-100"
      />
      {props.hint && <span className="mt-1 block text-xs text-ink-soft">{props.hint}</span>}
    </label>
  );
}

function AuthLayout({ title, sub, children }: { title: string; sub: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:py-20">
      <h1 className="text-center text-4xl font-extrabold">{title}</h1>
      <p className="mt-2 text-center text-ink-soft">{sub}</p>
      <Card className="mt-8 p-6 sm:p-8">{children}</Card>
    </div>
  );
}

export function LoginPage() {
  const done = useAfterAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const login = useMutation({ mutationFn: () => api.login(email, password), onSuccess: done });
  const [params] = useSearchParams();

  return (
    <AuthLayout
      title="Welcome back"
      sub={
        <>
          New here?{" "}
          <Link to={`/signup?${params}`} className="font-semibold text-leaf-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          login.mutate();
        }}
      >
        <Field label="E-mail" type="email" name="email" autoComplete="email" value={email} onChange={setEmail} />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
        />
        {login.error && <ErrorNote>{login.error.message}</ErrorNote>}
        <Button type="submit" size="lg" className="w-full" busy={login.isPending}>
          Log in
        </Button>
      </form>
    </AuthLayout>
  );
}

export function SignupPage() {
  const done = useAfterAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signup = useMutation({ mutationFn: () => api.register(email, password, name), onSuccess: done });
  const [params] = useSearchParams();

  return (
    <AuthLayout
      title="Join Trash2Cash"
      sub={
        <>
          Keep a history of your scans. Already have an account?{" "}
          <Link to={`/login?${params}`} className="font-semibold text-leaf-700 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          signup.mutate();
        }}
      >
        <Field label="Your name" type="text" name="name" autoComplete="nickname" value={name} onChange={setName} />
        <Field label="E-mail" type="email" name="email" autoComplete="email" value={email} onChange={setEmail} />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          minLength={8}
          hint="At least 8 characters."
        />
        {signup.error && <ErrorNote>{signup.error.message}</ErrorNote>}
        <Button type="submit" size="lg" className="w-full" busy={signup.isPending}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
