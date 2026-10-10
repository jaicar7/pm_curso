import { useEffect, useState, type FormEvent } from "react";
import { createUser, deleteUser, listUsers, updateUser, type ManagedUser, type User } from "@/lib/api";
import { CheckIcon, CloseIcon, KeyIcon, PlusIcon, ShieldIcon, TrashIcon } from "@/components/Icons";

const inputClass =
  "rounded-lg border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]";

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("es-ES");

export const UsersAdmin = ({ currentUser }: { currentUser: User }) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ username: "", password: "", isAdmin: false });
  const [resetting, setResetting] = useState<{ id: string; password: string } | null>(null);

  const run = async (operation: () => Promise<unknown>, success?: string) => {
    setError(null);
    setNotice(null);
    try {
      await operation();
      setUsers(await listUsers());
      if (success) setNotice(success);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "No se pudo completar la operación.");
    }
  };

  useEffect(() => {
    listUsers().then(setUsers, (loadError) =>
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los usuarios.")
    );
  }, []);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run(async () => {
      await createUser(form.username.trim(), form.password, form.isAdmin);
      setForm({ username: "", password: "", isAdmin: false });
    }, "Usuario creado.");
  };

  const handleReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetting) return;
    const { id, password } = resetting;
    await run(async () => {
      await updateUser(id, { password });
      setResetting(null);
    }, "Contraseña restablecida.");
  };

  const handleDelete = async (user: ManagedUser) => {
    if (!window.confirm(`¿Eliminar a ${user.username} y todos sus tableros?`)) return;
    await run(() => deleteUser(user.id), "Usuario eliminado.");
  };

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="rounded-2xl border border-[var(--stroke)] bg-white/90 p-5 shadow-[var(--shadow)]">
        <h2 className="font-display text-xl font-semibold text-[var(--navy-dark)]">Gestión de usuarios</h2>
        <p className="mt-1 text-sm text-[var(--gray-text)]">
          Crea cuentas, concede permisos de administrador o restablece contraseñas.
        </p>
        <form onSubmit={handleCreate} className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={form.username}
            onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
            placeholder="Usuario"
            aria-label="Nombre del nuevo usuario"
            required
            className={`${inputClass} w-44`}
          />
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            placeholder="Contraseña (mín. 8)"
            aria-label="Contraseña del nuevo usuario"
            required
            className={`${inputClass} w-52`}
          />
          <label className="flex items-center gap-2 text-sm text-[var(--navy-dark)]">
            <input
              type="checkbox"
              checked={form.isAdmin}
              onChange={(event) => setForm((prev) => ({ ...prev, isAdmin: event.target.checked }))}
            />
            Administrador
          </label>
          <button
            type="submit"
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-[var(--secondary-purple)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            <PlusIcon />
            Crear usuario
          </button>
        </form>
        {error ? (
          <p className="mt-3 text-sm font-semibold text-[var(--secondary-purple)]" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-3 text-sm font-semibold text-[var(--primary-blue)]" role="status">
            {notice}
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[var(--stroke)] bg-white/90 shadow-[var(--shadow)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--stroke)] text-xs uppercase tracking-[0.15em] text-[var(--gray-text)]">
            <tr>
              <th className="px-5 py-3 font-semibold">Usuario</th>
              <th className="px-5 py-3 font-semibold">Rol</th>
              <th className="px-5 py-3 font-semibold">Tableros</th>
              <th className="px-5 py-3 font-semibold">Alta</th>
              <th className="px-5 py-3 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === currentUser.id;
              return (
                <tr key={user.id} className="border-b border-[var(--stroke)] last:border-0" data-testid={`user-${user.username}`}>
                  <td className="px-5 py-3 font-semibold text-[var(--navy-dark)]">
                    {user.username}
                    {isSelf ? <span className="ml-2 text-xs font-normal text-[var(--gray-text)]">(tú)</span> : null}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={
                        user.is_admin
                          ? "rounded-full bg-[var(--secondary-purple)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--secondary-purple)]"
                          : "rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold text-[var(--gray-text)]"
                      }
                    >
                      {user.is_admin ? "Administrador" : "Usuario"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[var(--gray-text)]">{user.board_count}</td>
                  <td className="px-5 py-3 text-[var(--gray-text)]">{formatDate(user.created_at)}</td>
                  <td className="px-5 py-3">
                    {resetting?.id === user.id ? (
                      <form onSubmit={handleReset} className="flex items-center justify-end gap-1">
                        <input
                          type="password"
                          value={resetting.password}
                          onChange={(event) => setResetting({ id: user.id, password: event.target.value })}
                          placeholder="Nueva contraseña"
                          aria-label={`Nueva contraseña para ${user.username}`}
                          autoFocus
                          required
                          className={`${inputClass} w-44 py-1`}
                        />
                        <button type="submit" className="icon-button" aria-label="Guardar contraseña" title="Guardar">
                          <CheckIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => setResetting(null)}
                          className="icon-button"
                          aria-label="Cancelar"
                          title="Cancelar"
                        >
                          <CloseIcon />
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            run(
                              () => updateUser(user.id, { is_admin: !user.is_admin }),
                              user.is_admin ? "Permisos retirados." : "Permisos concedidos."
                            )
                          }
                          disabled={isSelf}
                          className="icon-button disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label={
                            user.is_admin
                              ? `Quitar administrador a ${user.username}`
                              : `Hacer administrador a ${user.username}`
                          }
                          title={user.is_admin ? "Quitar permisos de administrador" : "Hacer administrador"}
                        >
                          <ShieldIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => setResetting({ id: user.id, password: "" })}
                          className="icon-button"
                          aria-label={`Restablecer contraseña de ${user.username}`}
                          title="Restablecer contraseña"
                        >
                          <KeyIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(user)}
                          disabled={isSelf}
                          className="icon-button danger disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label={`Eliminar a ${user.username}`}
                          title="Eliminar usuario"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
