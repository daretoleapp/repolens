"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { DEMO_REPOS, DEFAULT_REPO } from "@/lib/demos";

interface RepoState {
  owner: string;
  name: string;
  setRepo: (owner: string, name: string) => void;
  isCustom: boolean;
}

const RepoContext = createContext<RepoState | null>(null);

const STORAGE_KEY = "repolens.repo";

export function RepoProvider({ children }: { children: ReactNode }) {
  const [repo, setRepoState] = useState({
    owner: DEFAULT_REPO.owner,
    name: DEFAULT_REPO.name,
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.owner && parsed.name) setRepoState(parsed);
      }
    } catch {}
    setHydrated(true);
  }, []);

  const setRepo = useCallback((owner: string, name: string) => {
    setRepoState({ owner, name });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, name }));
    } catch {}
  }, []);

  const isCustom = !DEMO_REPOS.some(d => d.owner === repo.owner && d.name === repo.name);

  if (!hydrated) {
    return (
      <RepoContext.Provider value={{ ...repo, setRepo, isCustom: false }}>
        {children}
      </RepoContext.Provider>
    );
  }

  return (
    <RepoContext.Provider value={{ ...repo, setRepo, isCustom }}>
      {children}
    </RepoContext.Provider>
  );
}

export function useRepo() {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error("useRepo must be inside RepoProvider");
  return ctx;
}
