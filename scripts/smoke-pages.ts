const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

const pages = [
  "/dashboard",
  "/needs-me",
  "/jobs",
  "/applications",
  "/evidence",
  "/profiles",
  "/resumes/generated",
  "/networking",
  "/outcomes",
  "/agents",
  "/settings",
];

async function main() {
  const failures: Array<{ path: string; status?: number; error?: string }> = [];

  for (const path of pages) {
    const url = new URL(path, baseUrl);
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 200 || response.status >= 400) {
        failures.push({ path, status: response.status });
      }
      console.log(`${response.status} ${path}`);
    } catch (error) {
      failures.push({ path, error: error instanceof Error ? error.message : "Unknown request error" });
      console.log(`ERR ${path}`);
    }
  }

  if (failures.length) {
    console.error("Smoke page failures:");
    for (const failure of failures) {
      console.error(JSON.stringify(failure));
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
