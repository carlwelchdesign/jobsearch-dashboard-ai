import { repairApplicationUrls, type ApplicationUrlRepairMode } from "../src/lib/applications/application-url-repair";
import { prisma } from "../src/lib/prisma";

async function main() {
  const mode: ApplicationUrlRepairMode = process.argv.includes("--apply") ? "apply" : "dry-run";
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.replace("--limit=", ""), 10) : undefined;
  const result = await repairApplicationUrls({
    mode,
    ...(Number.isFinite(limit) && limit && limit > 0 ? { limit } : {}),
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
