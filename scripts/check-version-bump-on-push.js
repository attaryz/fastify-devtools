#!/usr/bin/env node
/*
  Pre-push version bump enforcement (main branch)
  - Runs only when the current branch is 'main'
  - If commits since origin/main modify source files but no version bump is present in package.json, abort the push.
  - Set SKIP_VERSION_CHECK=1 to bypass.
*/
const { execSync } = require("node:child_process");

function run(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

if (process.env.SKIP_VERSION_CHECK === "1") process.exit(0);

const branch = run("git rev-parse --abbrev-ref HEAD");
if (branch !== "main") process.exit(0);

// Ensure we have origin/main ref locally
const hasOriginMain = run("git rev-parse --verify origin/main");
if (!hasOriginMain) {
  // Try to fetch origin/main quietly; ignore errors
  run("git fetch origin main --quiet");
}

// Files changed in commits that are on HEAD but not on origin/main
const changed = run("git diff --name-only origin/main..HEAD").split("\n").filter(Boolean);

if (changed.length === 0) process.exit(0);

const codePaths = ["src/", "test/", "scripts/", "package.json", "tsconfig.json"];
const hasCodeChanges = changed.some((p) => codePaths.some((cp) => p === cp || p.startsWith(cp)));
if (!hasCodeChanges) process.exit(0);

const pkgDiff = run("git diff origin/main..HEAD -- package.json");
const hasVersionBump = /\+\s*"version"\s*:\s*"\d+\.\d+\.\d+"/.test(pkgDiff);

if (hasVersionBump) process.exit(0);

console.error("\nPush blocked: no version bump detected in package.json for changes on main.");
console.error("Consider bumping the version before pushing to main:");
console.error("  yarn version patch  # or minor/major");
console.error("\nTo bypass, set SKIP_VERSION_CHECK=1 for this push (not recommended).");
process.exit(1);
