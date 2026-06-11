import { spawnSync } from "child_process";
import { existsSync } from "fs";
import path from "path";

export type LocalAssistantAvailability = {
  available: boolean;
  python: string;
  installed: boolean;
  enabledForNonLocalOrigins: boolean;
};

export function getLocalAssistantAvailability(): LocalAssistantAvailability {
  const venvPython = path.join(process.cwd(), ".venv-assistant", "bin", "python");
  const python = process.env.ASSISTANT_PYTHON ?? (existsSync(venvPython) ? venvPython : "python3");
  const check = spawnSync(python, ["-c", "import playwright.sync_api"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 5000,
  });
  const installed = check.status === 0;

  return {
    available: installed,
    python,
    installed,
    enabledForNonLocalOrigins: process.env.ENABLE_LOCAL_ASSISTANT === "true",
  };
}
