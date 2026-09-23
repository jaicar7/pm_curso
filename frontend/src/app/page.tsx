"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";

const sessionKey = "pm-mvp-authenticated";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasLoadedSession, setHasLoadedSession] = useState(false);

  useEffect(() => {
    setIsAuthenticated(window.localStorage.getItem(sessionKey) === "true");
    setHasLoadedSession(true);
  }, []);

  const handleLogin = () => {
    window.localStorage.setItem(sessionKey, "true");
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    window.localStorage.removeItem(sessionKey);
    setIsAuthenticated(false);
  };

  if (!hasLoadedSession || !isAuthenticated) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return <KanbanBoard onLogout={handleLogout} />;
}
