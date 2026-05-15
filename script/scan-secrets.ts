import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";

type Finding = {
  scope: "current" | "history";
  type: string;
  path: string;
  line?: number;
  commit?: string;
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const EXCLUDED_PATHS = new Set(["package-lock.json"]);

const currentPatterns: Array<{ type: string; regex: RegExp }> = [
  { type: "OpenAI API key", regex: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g },
  { type: "Anthropic API key", regex: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { type: "Resend API key", regex: /re_[A-Za-z0-9_]{20,}/g },
  {
    type: "JWT-like token",
    regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
  { type: "GitHub token", regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g },
  { type: "GitHub fine-grained token", regex: /github_pat_[A-Za-z0-9_]{20,}/g },
  { type: "Google API key", regex: /AIza[0-9A-Za-z_-]{20,}/g },
];

const historyPatterns: Array<{ type: string; pattern: string }> = [
  { type: "OpenAI API key", pattern: "sk-(proj-)?[A-Za-z0-9_-]{20,}" },
  { type: "Anthropic API key", pattern: "sk-ant-[A-Za-z0-9_-]{20,}" },
  { type: "Resend API key", pattern: "re_[A-Za-z0-9_]{20,}" },
  {
    type: "JWT-like token",
    pattern: "eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}",
  },
  { type: "GitHub token", pattern: "(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}" },
  { type: "GitHub fine-grained token", pattern: "github_pat_[A-Za-z0-9_]{20,}" },
  { type: "Google API key", pattern: "AIza[0-9A-Za-z_-]{20,}" },
];

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function isExcluded(path: string): boolean {
  return EXCLUDED_PATHS.has(path) || path.startsWith("node_modules/") || path.startsWith("dist/");
}

function lineNumberForOffset(contents: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i += 1) {
    if (contents.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function scanCurrentFiles(): Finding[] {
  const files = git(["ls-files", "-z"])
    .split("\0")
    .filter(Boolean)
    .filter((path) => !isExcluded(path));

  const findings: Finding[] = [];
  for (const path of files) {
    if (!existsSync(path)) continue;
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) continue;

    const contents = readFileSync(path, "utf8");
    for (const { type, regex } of currentPatterns) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(contents)) !== null) {
        findings.push({
          scope: "current",
          type,
          path,
          line: lineNumberForOffset(contents, match.index),
        });
      }
    }
  }
  return findings;
}

function scanHistory(): Finding[] {
  const commits = git(["rev-list", "--all"]).split("\n").filter(Boolean);
  const seen = new Set<string>();
  const findings: Finding[] = [];

  for (const commit of commits) {
    for (const { type, pattern } of historyPatterns) {
      let output = "";
      try {
        output = execFileSync(
          "git",
          ["grep", "-I", "-l", "-E", pattern, commit, "--", ".", ":(exclude)package-lock.json"],
          { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
        );
      } catch {
        continue;
      }

      for (const result of output.split("\n").filter(Boolean)) {
        const prefix = `${commit}:`;
        const path = result.startsWith(prefix) ? result.slice(prefix.length) : result;
        if (isExcluded(path)) continue;

        const key = `${type}:${commit}:${path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          scope: "history",
          type,
          path,
          commit: commit.slice(0, 12),
        });
      }
    }
  }

  return findings;
}

const findings = [...scanCurrentFiles(), ...scanHistory()];

if (findings.length === 0) {
  console.log("No high-confidence secret patterns found in tracked files or git history.");
  process.exit(0);
}

console.error("Potential secrets found. Values are intentionally not printed.");
for (const finding of findings) {
  const location =
    finding.scope === "current"
      ? `${finding.path}:${finding.line ?? "?"}`
      : `${finding.commit}:${finding.path}`;
  console.error(`- ${finding.scope}: ${finding.type} at ${location}`);
}
console.error("Rotate any exposed key before making the repository public.");
process.exit(1);
