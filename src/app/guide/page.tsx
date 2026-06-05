export const metadata = {
  title: "User Guide | Job Search OS",
  description: "Step-by-step guide to every feature in Job Search OS.",
};

import fs from "fs";
import path from "path";
import { AppShell } from "@/app/app-shell";
import { GuideClient } from "./guide-client";

export default function GuidePage() {
  const content = fs.readFileSync(
    path.join(process.cwd(), "docs/USER_GUIDE.md"),
    "utf-8",
  );

  return (
    <AppShell>
      <GuideClient content={content} />
    </AppShell>
  );
}
