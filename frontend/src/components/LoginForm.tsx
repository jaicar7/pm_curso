"use client";

import { FormEvent, useState } from "react";

type LoginFormProps = {
  onLogin: () => void;
};

export const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (username === "user" && password === "password") {
      onLogin();
      return;
    }

    setError("Invalid username or password.");
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Project workspace
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
          Welcome back
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
          Sign in to open your Kanban board.
        </p>
        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm font-semibold text-[var(--navy-dark)]" htmlFor="username">
              Username
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] px-4 py-3"
              id="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-[var(--navy-dark)]" htmlFor="password">
              Password
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] px-4 py-3"
              id="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </div>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <button
            className="w-full rounded-xl bg-[var(--secondary-purple)] px-4 py-3 font-semibold text-white"
            type="submit"
          >
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
};