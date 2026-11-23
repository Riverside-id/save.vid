#!/usr/bin/env node
// Runs Python from the project venv (.venv) when present, falling back to python3.
// On macOS python.org builds without a CA bundle, point SSL_CERT_FILE at the system bundle.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const venvPython = process.platform === "win32" ? path.join(root, ".venv", "Scripts", "python.exe") : path.join(root, ".venv", "bin", "python");
const python = existsSync(venvPython) ? venvPython : "python3";

const env = { ...process.env };
if (!env.SSL_CERT_FILE && process.platform === "darwin" && existsSync("/etc/ssl/cert.pem")) {
  env.SSL_CERT_FILE = "/etc/ssl/cert.pem";
}

const child = spawn(python, process.argv.slice(2), { stdio: "inherit", cwd: root, env });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
