// Playwright owns these processes; never load project dotenv files for regression runs.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontend = dirname(fileURLToPath(import.meta.url));
const backend = resolve(frontend, "../backend");

if (process.argv[2] === "frontend") {
  for (const key of Object.keys(process.env)) if (key.startsWith("VITE_")) delete process.env[key];
  process.env.VITE_API_PROXY_TARGET = "http://127.0.0.1:3000";
  const { build, preview } = await import("vite");
  await build({ root: frontend, envFile: false });
  await preview({
    root: frontend,
    envFile: false,
    preview: { host: "127.0.0.1", port: 4187, strictPort: true },
  });
} else if (process.argv[2] === "backend") {
  // Only the explicit live opt-in inherits provider configuration and credentials.
  const live = Boolean(process.env.AI_IMAGES_LIVE_MODEL_ID);
  if (live && existsSync(join(backend, ".env"))) process.loadEnvFile(join(backend, ".env"));
  const directory = await mkdtemp(join(tmpdir(), "linjian-e2e-"));
  let child;
  let stopping = false;
  let cleanupPromise;
  function cleanup() {
    stopping = true;
    cleanupPromise ??= (async () => {
      if (child && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        await new Promise((resolve) => child.once("exit", resolve));
      }
      await rm(directory, { recursive: true, force: true });
    })();
    return cleanupPromise;
  }
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      void cleanup().then(() => process.exit(0));
    });
  function run(script, env) {
    return new Promise((resolve, reject) => {
      if (stopping) return reject(new Error("E2E server is stopping"));
      child = spawn(process.execPath, ["--import", "tsx", script], {
        cwd: backend,
        env,
        stdio: "inherit",
      });
      child.once("error", reject);
      child.once("exit", (code, signal) =>
        code === 0 ? resolve() : reject(new Error(`${script} exited ${code ?? signal}`)),
      );
    });
  }
  try {
    const inherited = live
      ? process.env
      : { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
    const env = {
      ...inherited,
      NODE_ENV: "test",
      DATABASE_PATH: join(directory, "test.sqlite"),
      UPLOAD_DIR: join(directory, "uploads"),
      OWNER_EMAIL: "test@test.test",
      OWNER_PASSWORD: "test",
      HOST: "127.0.0.1",
      PORT: "3000",
      FRONTEND_ORIGIN: "http://127.0.0.1:4187",
      COOKIE_SECURE: "false",
      AI_IMAGES_ENABLED: live ? "true" : "false",
    };
    await run("src/commands/init.ts", env);
    await run("src/commands/owner-init.ts", env);
    await run("src/commands/seed.ts", env);
    await run("src/server.ts", env);
  } finally {
    await cleanup();
  }
} else {
  throw new Error("Expected frontend or backend");
}
