import type { JobSourceType } from "@prisma/client";
import type { JobSourceAdapter } from "@/lib/job-search/source-adapter";
import { ashbyAdapter } from "./ashby";
import { companySiteAdapter } from "./company-site";
import { greenhouseAdapter } from "./greenhouse";
import { leverAdapter } from "./lever";
import { remoteOkAdapter } from "./remoteok";
import { weWorkRemotelyAdapter } from "./weworkremotely";

const adapters: Partial<Record<JobSourceType, JobSourceAdapter>> = {
  ashby: ashbyAdapter,
  greenhouse: greenhouseAdapter,
  remoteok: remoteOkAdapter,
  lever: leverAdapter,
  weworkremotely: weWorkRemotelyAdapter,
  company_site: companySiteAdapter,
};

export function getAdapterForSource(type: JobSourceType) {
  return adapters[type] ?? null;
}
