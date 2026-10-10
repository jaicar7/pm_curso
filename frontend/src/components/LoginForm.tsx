"use client";

import { FormEvent, useState } from "react";
import { login, register, type User } from "@/lib/api";

type LoginFormProps = {
  onLogin: (user: User) => void;
};

export const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRegister = mode === "register";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      onLogin(await (isRegister ? register : login)(username, password));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo iniciar sesión.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode(isRegister ? "login" : "register");
    setError("");
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
          Espacio de proyecto
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
          {isRegister ? "Crea tu cuenta" : "Bienvenido de nuevo"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
          {isRegister
            ? "Regístrate para empezar con tu propio tablero Kanban."
            : "Inicia sesión para abrir tus tableros Kanban."}
        </p>
        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="text-sm font-semibold text-[var(--navy-dark)]" htmlFor="username">
              Usuario
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] px-4 py-3 outline-none transition focus:border-[var(--primary-blue)]"
              id="username"
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-[var(--navy-dark)]" htmlFor="password">
              Contraseña
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-[var(--stroke)] px-4 py-3 outline-none transition focus:border-[var(--primary-blue)]"
              id="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            {isRegister ? (
              <p className="mt-2 text-xs text-[var(--gray-text)]">Al menos 8 caracteres.</p>
            ) : null}
          </div>
          {error ? (
            <p className="text-sm font-semibold text-[var(--secondary-purple)]" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="w-full rounded-xl bg-[var(--secondary-purple)] px-4 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isRegister ? "Crear cuenta" : "Iniciar sesión"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-[var(--gray-text)]">
          {isRegister ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?"}{" "}
          <button
            type="button"
            onClick={switchMode}
            className="font-semibold text-[var(--primary-blue)] hover:underline"
          >
            {isRegister ? "Inicia sesión" : "Regístrate"}
          </button>
        </p>
      </section>
    </main>
  );
};
