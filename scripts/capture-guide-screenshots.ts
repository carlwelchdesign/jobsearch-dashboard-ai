/**
 * Captures screenshots of key app pages for the user guide.
 * Run: npx tsx scripts/capture-guide-screenshots.ts
 * Requires the dev server to be running on http://localhost:3000
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const BASE_URL = "http://localhost:3000";
const OUTPUT_DIR = path.join(process.cwd(), "public/guide-screenshots");

const PAGES = [
  { name: "dashboard", path: "/dashboard" },
  { name: "needs-me", path: "/needs-me" },
  { name: "jobs", path: "/jobs" },
  { name: "apply-sprint", path: "/applications/assistant" },
  { name: "field-learning", path: "/applications/field-learning" },
  { name: "applications", path: "/applications" },
  { name: "evidence", path: "/evidence" },
  { name: "profiles", path: "/profiles" },
  { name: "sources", path: "/sources" },
  { name: "resumes", path: "/resumes" },
  { name: "settings", path: "/settings" },
];

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 860 },
    colorScheme: "light",
  });

  const page = await context.newPage();

  for (const { name, path: pagePath } of PAGES) {
    const url = `${BASE_URL}${pagePath}`;
    console.log(`📸  ${name}  →  ${url}`);
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 25000 });
      await page.waitForTimeout(1500);
      const out = path.join(OUTPUT_DIR, `${name}.png`);
      await page.screenshot({ path: out });
      console.log(`    ✓  ${out}`);
    } catch (e) {
      console.error(`    ✗  failed: ${(e as Error).message}`);
    }
  }

  await browser.close();
  console.log("\nAll done ✓");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
