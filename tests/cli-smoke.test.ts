import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../src/commands/doctor.js";
import { runStatus } from "../src/commands/status.js";

const repoRoot = path.resolve(".");
const cli = path.join(repoRoot, "dist", "cli.js");

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("CLI smoke", () => {
  it("prints doctor and status from the command modules", () => {
    const doctor = runDoctor(repoRoot);
    const status = runStatus(repoRoot);
    expect(doctor).toContain("UADS doctor");
    expect(doctor).toContain("projectId:");
    expect(status).toContain("UADS status");
    expect(status).toContain("zeroProjectFootprint: true");
    expect(status).toContain("fingerprint:");
  });

  it("exposes --help, doctor, and status through the compiled CLI", () => {
    if (!fs.existsSync(cli)) {
      return;
    }

    const help = runCli(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("uads");
    expect(help.stdout).toContain("doctor");
    expect(help.stdout).toContain("status");
    expect(help.stdout).toContain("review");
    expect(help.stdout).toContain("inspect");
    expect(help.stdout).toContain("plan");
    expect(help.stdout).toContain("resume");
    expect(help.stdout).toContain("failure");
    expect(help.stdout).toContain("diagnose");
    expect(help.stdout).toContain("cache");
    expect(help.stdout).toContain("cost");

    const doctor = runCli(["doctor"]);
    expect(doctor.status).toBe(0);
    expect(doctor.stdout).toContain("UADS doctor");

    const status = runCli(["status"]);
    expect(status.status).toBe(0);
    expect(status.stdout).toContain("UADS status");
  });
});
