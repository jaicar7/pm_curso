"use client";

import { useState, useSyncExternalStore } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";

const sessionKey = "pm-mvp-authenticated";
const subscribe = () => () => {};

export default function Home() {
  const storedSession = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(sessionKey) === "true",
    () => false
  );
  const [session, setIsAuthenticated] = useState<boolean | null>(null);
  const isAuthenticated = session ?? storedSession;

  const handleLogin = () => {
    window.localStorage.setItem(sessionKey, "true");
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    window.localStorage.removeItem(sessionKey);
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return <KanbanBoard onLogout={handleLogout} />;
}
