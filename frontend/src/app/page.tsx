"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LoginForm } from "@/components/LoginForm";
import { fetchMe, logout, type User } from "@/lib/api";

export default function Home() {
  // undefined while the session is being checked, null when signed out.
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    fetchMe().then(setUser, () => setUser(null));
  }, []);

  // Wait for the server to drop the session cookie so a quick re-login cannot race with it.
  const handleLogout = useCallback(() => {
    void logout()
      .catch(() => undefined)
      .finally(() => setUser(null));
  }, []);

  if (user === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm font-semibold text-[var(--gray-text)]">Cargando...</p>
      </main>
    );
  }

  if (!user) {
    return <LoginForm onLogin={setUser} />;
  }

  return <AppShell key={user.id} user={user} onLogout={handleLogout} />;
}
