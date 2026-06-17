import { repairApplicationMaterials, type ApplicationMaterialRepairMode } from "../src/lib/applications/material-quality-repair";
import { prisma } from "../src/lib/prisma";

async function main() {
  const mode: ApplicationMaterialRepairMode = process.argv.includes("--apply") ? "apply" : "dry-run";
  const regenerate = process.argv.includes("--regenerate");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.replace("--limit=", ""), 10) : undefined;
  const result = await repairApplicationMaterials({
    mode,
    regenerate,
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
