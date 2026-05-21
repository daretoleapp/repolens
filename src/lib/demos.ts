/**
 * Demo repo presets — bundled examples reviewers can click without entering
 * a GitHub PAT. Carefully picked so each surface (Overview, PR Intel, Hotspots,
 * Contributors) has rich data even on first load.
 */

export interface DemoRepo {
  owner: string;
  name: string;
  label: string;
  description: string;
  language: string;
  size: "small" | "medium" | "large";
}

export const DEMO_REPOS: DemoRepo[] = [
  {
    owner: "daretoleapp",
    name: "strukly",
    label: "Strukly (own)",
    description: "Workspace organizer — submitted to MiMo Pro",
    language: "TypeScript",
    size: "small",
  },
  {
    owner: "daretoleapp",
    name: "chronos",
    label: "Chronos (own)",
    description: "Time/calendar app",
    language: "TypeScript",
    size: "small",
  },
  {
    owner: "daretoleapp",
    name: "recallr",
    label: "Recallr (own)",
    description: "Memory recall app",
    language: "TypeScript",
    size: "small",
  },
  {
    owner: "vercel",
    name: "next.js",
    label: "Next.js",
    description: "React framework — large, busy",
    language: "TypeScript",
    size: "large",
  },
  {
    owner: "shadcn-ui",
    name: "ui",
    label: "shadcn/ui",
    description: "Beautifully designed components",
    language: "TypeScript",
    size: "medium",
  },
  {
    owner: "facebook",
    name: "react",
    label: "React",
    description: "Meta's UI library",
    language: "JavaScript",
    size: "large",
  },
];

export const DEFAULT_REPO = DEMO_REPOS[3]; // vercel/next.js — most data
