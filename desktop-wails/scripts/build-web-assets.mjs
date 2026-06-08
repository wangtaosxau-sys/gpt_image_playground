import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, "..");
const repoRoot = resolve(desktopDir, "..");
const sourceDir = resolve(repoRoot, "dist");
const targetDir = resolve(desktopDir, "frontend", "dist");
const expectedTargetDir = resolve(desktopDir, "frontend", "dist");
const buildCommand = process.platform === "win32" ? "cmd.exe" : "npm";
const buildArgs = process.platform === "win32"
  ? ["/d", "/c", "npm.cmd", "run", "build"]
  : ["run", "build"];

function copyDirectory(source, target) {
  mkdirSync(target, { recursive: true });

  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
    }
  }
}

const build = spawnSync(buildCommand, buildArgs, {
  cwd: repoRoot,
  stdio: "inherit",
});

if (build.error) {
  console.error(`[wails] Failed to run Web build: ${build.error.message}`);
  process.exit(1);
}

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

if (!existsSync(resolve(sourceDir, "index.html"))) {
  console.error(`[wails] Missing Web build output: ${sourceDir}`);
  process.exit(1);
}

if (targetDir !== expectedTargetDir) {
  console.error(`[wails] Refusing to clean unexpected target: ${targetDir}`);
  process.exit(1);
}

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
try {
  copyDirectory(sourceDir, targetDir);
} catch (error) {
  console.error(`[wails] Failed to sync ${relative(repoRoot, sourceDir)} to ${relative(repoRoot, targetDir)}:`);
  console.error(error);
  process.exit(1);
}

if (!statSync(resolve(targetDir, "index.html")).isFile()) {
  console.error(`[wails] Missing synced index.html: ${targetDir}`);
  process.exit(1);
}

console.log(`[wails] Synced Web build to ${targetDir}`);
