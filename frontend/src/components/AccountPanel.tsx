import { useState, type FormEvent } from "react";
import { changePassword, type User } from "@/lib/api";

const inputClass =
  "mt-1 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]";

export const AccountPanel = ({ user }: { user: User }) => {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (form.next !== form.confirm) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }
    try {
      await changePassword(form.current, form.next);
      setForm({ current: "", next: "", confirm: "" });
      setNotice("Contraseña actualizada. Se han cerrado tus otras sesiones.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo cambiar la contraseña.");
    }
  };

  const field = (key: keyof typeof form, label: string, autoComplete: string) => (
    <label className="block text-sm font-semibold text-[var(--navy-dark)]">
      {label}
      <input
        type="password"
        value={form[key]}
        onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
        autoComplete={autoComplete}
        required
        className={inputClass}
      />
    </label>
  );

  return (
    <section className="mx-auto grid w-full max-w-5xl gap-4 md:grid-cols-[1fr_2fr]">
      <div className="rounded-2xl border border-[var(--stroke)] bg-white/90 p-5 shadow-[var(--shadow)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">Mi cuenta</p>
        <h2 className="mt-1 font-display text-xl font-semibold text-[var(--navy-dark)]">{user.username}</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--gray-text)]">Rol</dt>
            <dd className="font-semibold text-[var(--navy-dark)]">{user.is_admin ? "Administrador" : "Usuario"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--gray-text)]">Miembro desde</dt>
            <dd className="font-semibold text-[var(--navy-dark)]">
              {new Date(user.created_at).toLocaleDateString("es-ES")}
            </dd>
          </div>
        </dl>
      </div>
      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-2xl border border-[var(--stroke)] bg-white/90 p-5 shadow-[var(--shadow)]"
      >
        <h2 className="font-display text-xl font-semibold text-[var(--navy-dark)]">Cambiar contraseña</h2>
        {field("current", "Contraseña actual", "current-password")}
        <div className="grid gap-3 sm:grid-cols-2">
          {field("next", "Nueva contraseña", "new-password")}
          {field("confirm", "Repite la nueva contraseña", "new-password")}
        </div>
        {error ? (
          <p className="text-sm font-semibold text-[var(--secondary-purple)]" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="text-sm font-semibold text-[var(--primary-blue)]" role="status">
            {notice}
          </p>
        ) : null}
        <button
          type="submit"
          className="rounded-xl bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Cambiar contraseña
        </button>
      </form>
    </section>
  );
};
