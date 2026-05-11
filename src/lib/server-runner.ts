import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut?: boolean;
}

export async function runFileCommand(
  command: string,
  args: string[],
  cwd?: string,
  input?: string,
  options: { timeoutMs?: number } = {},
): Promise<CommandResult> {
  if (typeof input === "string") {
    return runSpawnCommand(command, args, cwd, input, options.timeoutMs || 120_000);
  }

  const startedAt = performance.now();
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      timeout: options.timeoutMs || 120_000,
      maxBuffer: 1024 * 1024 * 8,
      windowsHide: true,
    });

    return {
      stdout,
      stderr,
      exitCode: 0,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    const commandError = error as {
      stdout?: string;
      stderr?: string;
      code?: number;
      signal?: string;
      message?: string;
    };

    return {
      stdout: commandError.stdout || "",
      stderr: commandError.stderr || commandError.message || commandError.signal || "",
      exitCode: typeof commandError.code === "number" ? commandError.code : 1,
      durationMs: Math.round(performance.now() - startedAt),
      timedOut: commandError.signal === "SIGTERM" || /timed out/i.test(commandError.message || ""),
    };
  }
}

function runSpawnCommand(command: string, args: string[], cwd: string | undefined, input: string, timeoutMs: number): Promise<CommandResult> {
  const startedAt = performance.now();

  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const timeout = windowlessTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8") || error.message,
        exitCode: 1,
        durationMs: Math.round(performance.now() - startedAt),
        timedOut,
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr:
          Buffer.concat(stderrChunks).toString("utf8") ||
          (timedOut ? `Command timed out after ${Math.round(timeoutMs / 1000)} seconds.` : ""),
        exitCode: timedOut ? 124 : typeof code === "number" ? code : 1,
        durationMs: Math.round(performance.now() - startedAt),
        timedOut,
      });
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

function windowlessTimeout(callback: () => void, timeoutMs: number) {
  return setTimeout(callback, timeoutMs);
}
