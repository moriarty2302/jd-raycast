import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Running the jd CLI as a program. jd does the real work (numbering, notes,
// folders, the task app); this only builds arguments and reads jd's --json
// answer. Matching is on jd's `code`, never its wording (jd README, "For
// agents"). No Raycast imports, so it runs under plain Node for tests.

export const DEFAULT_JD = path.join(os.homedir(), ".local", "share", "johnnydecimal", "cli", "bin", "jd");

// Raycast starts commands with a short PATH; jd needs bash, jq, sqlite3 and
// osascript. Prepend the usual places so Homebrew's jq is found anywhere.
const EXTRA_PATH = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"];

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface JdPaths {
  config: string;
  journal: string;
  install: string;
}

export interface ToFill {
  token: string;
  brief: string;
  flag: string;
}

export interface NewWpOk {
  ok: true;
  sys: string;
  num: string;
  id: string;
  title: string;
  name: string;
  note: string;
  folder: string;
  template?: string;
  notesUrl?: string;
  tasksUrl?: string;
  toFill: ToFill[];
  warnings: string[];
  dryRun: boolean;
}

export interface JdError {
  ok: false;
  code: string;
  message: string;
  path?: string;
  stderr?: string;
}

export interface NewWpRequest {
  sys: string;
  id: string;
  title: string;
  // Template fields by flag, e.g. { "--scope": "What's in" }. Empty values
  // are left out, so jd uses the template's brief.
  fields?: Record<string, string>;
  tasks?: boolean;
  dryRun?: boolean;
}

export function jdEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const rest = (base.PATH ?? "").split(":").filter(Boolean);
  return { ...base, PATH: [...new Set([...EXTRA_PATH, ...rest])].join(":") };
}

// The jd program to run: the configured one if given, else jd's documented
// install location. Null when neither exists.
export function findJd(configured?: string): string | null {
  for (const p of [configured, DEFAULT_JD]) {
    if (!p) continue;
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch {
      // try the next
    }
  }
  return null;
}

export function runJd(jd: string, args: string[], timeoutMs = 60000): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(jd, args, { env: jdEnv(), timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
      const err = String(stderr) || (error ? String(error.message) : "");
      resolve({ code, stdout: String(stdout), stderr: err });
    });
  });
}

// jd's --json answer, or a JdError when there is none to read.
export function parseJson<T>(r: RunResult): T | JdError {
  try {
    const j = JSON.parse(r.stdout);
    if (j && typeof j === "object" && typeof j.ok === "boolean") {
      if (!j.ok)
        return { ok: false, code: j.code || "error", message: j.message || "", path: j.path, stderr: r.stderr };
      return j as T;
    }
  } catch {
    // fall through
  }
  return {
    ok: false,
    code: r.code === 127 ? "jd_not_found" : "bad_output",
    message: r.stderr.trim() || r.stdout.trim() || `jd exited with ${r.code}`,
    stderr: r.stderr,
  };
}

// Where jd keeps its files. jd's README: a program that needs the config
// path "must get the path from `jd paths`".
export async function jdPaths(jd: string): Promise<JdPaths | JdError> {
  const r = parseJson<JdPaths & { ok: true }>(await runJd(jd, ["paths", "--json"], 15000));
  if (!r.ok) return r;
  return { config: r.config, journal: r.journal, install: r.install };
}

// The arguments for `jd new wp`. The title goes in as one argument and each
// field as --flag=value, so spaces, dashes and quotes in either reach jd
// intact. The title is folded onto one line; field values keep their line
// breaks (jd inserts them as given; see continueLines in wp.ts).
export function newWpArgs(req: NewWpRequest): string[] {
  const args = ["--system", req.sys, "new", "wp", req.id, oneLine(req.title)];
  for (const [flag, value] of Object.entries(req.fields ?? {})) {
    const v = value.trim();
    if (!/^--[a-z0-9-]+$/.test(flag)) throw new Error(`not a field flag: ${flag}`);
    if (v) args.push(`${flag}=${v}`);
  }
  if (req.tasks === false) args.push("--no-tasks");
  if (req.dryRun) args.push("--dry-run");
  args.push("--json");
  return args;
}

export async function newWp(jd: string, req: NewWpRequest): Promise<NewWpOk | JdError> {
  // A real run waits for Things to make the project, which can be slow
  // when Things has to start; a dry run is quick.
  return parseJson<NewWpOk>(await runJd(jd, newWpArgs(req), req.dryRun ? 30000 : 120000));
}

function oneLine(s: string): string {
  return s.replace(/\s*[\r\n]+\s*/g, " ").trim();
}
