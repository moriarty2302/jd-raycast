import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// One system as jd's config describes it. `root` is the filesystem, `jdex`
// is the vault, which jd treats as optional. We only read the config; jd
// owns it.
export interface JdSystem {
  sys: string;
  name: string;
  root: string;
  jdex?: string;
  default?: boolean;
  // The system has a workPackages block, so `jd new wp` is set up for it.
  workPackages: boolean;
  // Its task app adapter ("things"), if it has one.
  wpTasks?: string;
}

export const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".config", "johnnydecimal", "config.json");

export function readSystems(configPath: string = DEFAULT_CONFIG_PATH): JdSystem[] {
  const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const systems: unknown[] = Array.isArray(raw?.systems) ? raw.systems : [];
  return systems.filter(isSystem).map((s) => ({
    sys: s.sys,
    // jd's own example calls this "title"; older configs say "name".
    name: s.name ?? (s as { title?: string }).title ?? s.sys,
    root: s.root,
    jdex: jdexPath(s),
    default: s.default === true,
    workPackages: typeof (s as { workPackages?: unknown }).workPackages === "object",
    wpTasks: taskAdapter(s),
  }));
}

// Config version 2 (jd 5) makes `jdex` an object with the folder in `path`;
// version 1 had the folder as a plain string.
function jdexPath(s: unknown): string | undefined {
  const j = (s as { jdex?: unknown }).jdex;
  const p = typeof j === "object" && j !== null ? (j as { path?: unknown }).path : j;
  return typeof p === "string" && p ? p : undefined;
}

// Version 2 names the task app `app`; version 1 called it `adapter`.
function taskAdapter(s: unknown): string | undefined {
  const t = (s as { workPackages?: { tasks?: { app?: unknown; adapter?: unknown } } }).workPackages?.tasks;
  const a = t?.app ?? t?.adapter;
  return typeof a === "string" && a !== "none" ? a : undefined;
}

function isSystem(s: unknown): s is JdSystem {
  if (typeof s !== "object" || s === null) return false;
  const o = s as Record<string, unknown>;
  return (
    typeof o.sys === "string" &&
    typeof o.root === "string" &&
    (o.jdex === undefined || o.jdex === null || typeof o.jdex === "string" || typeof o.jdex === "object")
  );
}

export type ConfigSource = "setting" | "jd" | "default";

// Which config file to read. A path set in the extension's settings wins,
// since someone set it on purpose. Otherwise ask jd (`jd paths`), which
// follows $JD_CONFIG and XDG as jd itself does. With no jd, fall back to
// jd's documented default.
export async function resolveConfigPath(opts: {
  setting?: string;
  jd?: string | null;
  ask?: (jd: string) => Promise<{ config: string } | { ok: false }>;
}): Promise<{ path: string; source: ConfigSource }> {
  if (opts.setting) return { path: opts.setting, source: "setting" };
  if (opts.jd && opts.ask) {
    const r = await opts.ask(opts.jd);
    if ("config" in r && r.config) return { path: r.config, source: "jd" };
  }
  return { path: DEFAULT_CONFIG_PATH, source: "default" };
}
