#!/usr/bin/env node

/**
 * Release helper — bumps version, stages files, and creates a release commit.
 *
 * Usage: node scripts/release.cjs <major|minor|patch>
 */

const { execSync } = require("child_process");

const type = process.argv[2];

if (!["major", "minor", "patch"].includes(type)) {
  console.error("Usage: node scripts/release.cjs <major|minor|patch>");
  process.exit(1);
}

// Bump version in package.json (no git tag — we handle that in CI)
execSync(`npm version ${type} --no-git-tag-version`, { stdio: "inherit" });

// Read the new version
const { version } = require("../package.json");

// Stage and commit
execSync("git add package.json package-lock.json", { stdio: "inherit" });
execSync(`git commit -m "chore(release): v${version}"`, { stdio: "inherit" });

console.log(`\nReleased v${version} — push your branch and open a PR.`);
