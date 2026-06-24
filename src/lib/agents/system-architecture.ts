import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentRun } from "@prisma/client";
import { runAgent } from "@/lib/agents/run-agent";
import { prisma } from "@/lib/prisma";

export type SystemArchitectureInput = {
  userId?: string | null;
  rootDir?: string;
  source?: "manual" | "dashboard" | "jolene" | "test";
};

export type ArchitectureNode = {
  id: string;
  label: string;
  kind: "ui" | "api" | "agent" | "data" | "workflow" | "doc" | "skill";
  path?: string;
  summary: string;
};

export type ArchitectureEdge = {
  from: string;
  to: string;
  label: string;
};

export type ArchitectureRisk = {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  evidence: string[];
  recommendation: string;
};

export type SystemArchitectureOutput = {
  title: string;
  generatedAt: string;
  summary: string;
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  workflows: Array<{ name: string; steps: string[]; evidence: string[] }>;
  risks: ArchitectureRisk[];
  documentation: Array<{ path: string; summary: string }>;
  recommendedDecisions: string[];
  metrics: {
    appRoutes: number;
    apiRoutes: number;
    prismaModels: number;
    prismaEnums: number;
    agentTypes: number;
    skillIds: number;
    plans: number;
  };
};

type RepoEvidence = {
  appRoutes: string[];
  apiRoutes: string[];
  prismaModels: string[];
  prismaEnums: string[];
  agentTypes: string[];
  agentFiles: string[];
  skillIds: string[];
  docs: string[];
  docContents: DocEvidence[];
  plans: string[];
  adkEnabled: boolean;
  langGraphMentions: string[];
};

type DocEvidence = {
  path: string;
  content: string;
};

export async function runSystemArchitectureAgent(input: SystemArchitectureInput = {}) {
  return runAgent<SystemArchitectureInput, SystemArchitectureOutput>({
    agentType: "SYSTEM_ARCHITECTURE",
    input,
    userId: input.userId,
    execute: async (run) => {
      const output = await buildSystemArchitectureReport(input.rootDir ?? process.cwd());
      await recordArchitectureEvents(run, output);
      return output;
    },
  });
}

export async function buildSystemArchitectureReport(rootDir = process.cwd()): Promise<SystemArchitectureOutput> {
  const evidence = await collectSystemArchitectureEvidence(rootDir);
  const skillCoverageGap = evidence.agentTypes.filter((agentType) => !evidence.skillIds.includes(toSkillId(agentType)));
  const apiWithoutDocs = evidence.apiRoutes.filter((route) => !hasDocMention(route, evidence.docContents)).slice(0, 8);
  const nodes = buildNodes(evidence);
  const risks = buildRisks(evidence, skillCoverageGap, apiWithoutDocs);

  return {
    title: "System Architecture Report",
    generatedAt: new Date().toISOString(),
    summary: `Mapped ${evidence.appRoutes.length} app route(s), ${evidence.apiRoutes.length} API route(s), ${evidence.agentTypes.length} agent type(s), and ${evidence.prismaModels.length} Prisma model(s) from repository evidence.`,
    nodes,
    edges: buildEdges(evidence),
    workflows: buildWorkflows(evidence),
    risks,
    documentation: evidence.docs.slice(0, 12).map((doc) => ({ path: doc, summary: documentationSummary(doc) })),
    recommendedDecisions: recommendedDecisions(risks),
    metrics: {
      appRoutes: evidence.appRoutes.length,
      apiRoutes: evidence.apiRoutes.length,
      prismaModels: evidence.prismaModels.length,
      prismaEnums: evidence.prismaEnums.length,
      agentTypes: evidence.agentTypes.length,
      skillIds: evidence.skillIds.length,
      plans: evidence.plans.length,
    },
  };
}

export async function collectSystemArchitectureEvidence(rootDir = process.cwd()): Promise<RepoEvidence> {
  const [appFiles, apiFiles, agentFiles, docFiles, plans, schema, skillTypes, adkRegistry, packageJson] = await Promise.all([
    listFiles(path.join(rootDir, "src/app"), (file) => file.endsWith("/page.tsx")),
    listFiles(path.join(rootDir, "src/app/api"), (file) => file.endsWith("/route.ts")),
    listFiles(path.join(rootDir, "src/lib/agents"), (file) => file.endsWith(".ts")),
    listFiles(rootDir, (file) => /(^README\.md$|^wiki\/.+\.md$|^\.agents\/skills\/.+\/SKILL\.md$)/.test(relative(rootDir, file))),
    listFiles(path.join(rootDir, "plans"), (file) => file.endsWith(".md")),
    readOptional(path.join(rootDir, "prisma/schema.prisma")),
    readOptional(path.join(rootDir, "src/lib/skills/types.ts")),
    readOptional(path.join(rootDir, "src/lib/adk/registry.ts")),
    readOptional(path.join(rootDir, "package.json")),
  ]);

  const appRoutes = appFiles.map((file) => routeFromPage(rootDir, file)).sort();
  const apiRoutes = apiFiles.map((file) => routeFromApi(rootDir, file)).sort();
  const docContents = await Promise.all(docFiles.map(async (file) => {
    const docPath = relative(rootDir, file);
    return { path: docPath, content: await readOptional(file) };
  }));
  const prismaModels = matches(schema, /^model\s+(\w+)/gm);
  const prismaEnums = matches(schema, /^enum\s+(\w+)/gm);
  const agentTypes = enumValues(schema, "AgentType");
  const skillIds = matches(skillTypes, /\|\s+"([^"]+)"/g);
  const langGraphMentions = [packageJson, adkRegistry].flatMap((content) => matches(content, /(LangGraph|langgraph|RECRUITING_AGENCY)/g));

  return {
    appRoutes,
    apiRoutes,
    prismaModels,
    prismaEnums,
    agentTypes,
    agentFiles: agentFiles.map((file) => relative(rootDir, file)).sort(),
    skillIds,
    docs: docContents.map((doc) => doc.path).sort(),
    docContents: docContents.sort((a, b) => a.path.localeCompare(b.path)),
    plans: plans.map((file) => relative(rootDir, file)).sort(),
    adkEnabled: adkRegistry.includes("adkManagedAgents"),
    langGraphMentions,
  };
}

function buildNodes(evidence: RepoEvidence): ArchitectureNode[] {
  const routeNodes = evidence.appRoutes.slice(0, 12).map((route) => node(`ui:${route}`, route, "ui", `App Router page at ${route}.`));
  const apiNodes = evidence.apiRoutes.slice(0, 16).map((route) => node(`api:${route}`, route, "api", `Route handler for ${route}.`));
  const agentNodes = evidence.agentTypes.map((agentType) => node(`agent:${agentType}`, humanize(agentType), "agent", `AgentRun type ${agentType}.`));
  return [
    node("workflow:command-center", "Command Center", "workflow", "Dashboard, Jolene, search runs, and review gates coordinate daily work."),
    node("data:prisma", "Prisma/Postgres", "data", `${evidence.prismaModels.length} models and ${evidence.prismaEnums.length} enums provide durable memory.`),
    node("skill:registry", "Code-first Skill Registry", "skill", `${evidence.skillIds.length} skill IDs map behavior to policy and learning rules.`),
    ...routeNodes,
    ...apiNodes,
    ...agentNodes,
    node("doc:wiki", "README/Wiki/Plans", "doc", `${evidence.docs.length} docs and ${evidence.plans.length} plan files provide architecture memory.`),
  ];
}

function buildEdges(evidence: RepoEvidence): ArchitectureEdge[] {
  return [
    { from: "workflow:command-center", to: "data:prisma", label: "reads operating state" },
    { from: "workflow:command-center", to: "skill:registry", label: "launches governed skills" },
    { from: "skill:registry", to: "data:prisma", label: "records AgentRun output" },
    { from: "doc:wiki", to: "workflow:command-center", label: "documents behavior" },
    ...evidence.apiRoutes.slice(0, 12).map((route) => ({ from: `api:${route}`, to: "data:prisma", label: "persists or reads" })),
    ...evidence.agentTypes.slice(0, 18).map((agentType) => ({ from: `agent:${agentType}`, to: "data:prisma", label: "AgentRun observability" })),
  ];
}

function buildWorkflows(evidence: RepoEvidence) {
  const workflows = [
    {
      name: "Job discovery to Apply Sprint",
      steps: ["Search run collects jobs", "Scoring filters and saves matches", "Recruiting agency prepares eligible matches", "User approves before external submit"],
      evidence: ["/runs", "/applications/assistant", "RECRUITING_AGENCY"],
    },
    {
      name: "Jolene operating layer",
      steps: ["Chief of Staff summarizes state", "Operating Loop proposes internal work", "Confirmation cards gate app-local actions", "AgentRun/Event history records execution"],
      evidence: ["JOLENE_CHIEF_OF_STAFF", "JOLENE_OPERATING_LOOP", "AgentRunEvent"],
    },
    {
      name: "Email response intelligence",
      steps: ["Inbox scout syncs job-response email", "Matcher links messages to applications", "Classifier creates findings", "Calendar drafts remain approval-gated"],
      evidence: evidence.agentTypes.filter((type) => type.includes("EMAIL")).slice(0, 6),
    },
  ];
  if (evidence.adkEnabled) workflows.push({
    name: "ADK control-plane supervision",
    steps: ["Selected low-risk agents register read-only tools", "ADK metadata is stored on AgentRun", "LangGraph stays reserved for durable workflow state"],
    evidence: ["src/lib/adk/registry.ts", ...evidence.langGraphMentions.slice(0, 2)],
  });
  return workflows;
}

function buildRisks(evidence: RepoEvidence, skillCoverageGap: string[], apiWithoutDocs: string[]): ArchitectureRisk[] {
  const risks: ArchitectureRisk[] = [];
  if (skillCoverageGap.length) {
    risks.push({
      severity: "high",
      title: "Agent types without skill policy coverage",
      detail: `${skillCoverageGap.length} agent type(s) do not map to code-first skills.`,
      evidence: skillCoverageGap.slice(0, 8),
      recommendation: "Add registry entries or intentionally document why these agent types are infrastructure-only.",
    });
  }
  if (apiWithoutDocs.length) {
    risks.push({
      severity: "medium",
      title: "API surfaces need clearer architecture documentation",
      detail: `${apiWithoutDocs.length} route(s) were not obviously referenced in README or wiki docs.`,
      evidence: apiWithoutDocs,
      recommendation: "Document the workflow owner, data boundary, and approval policy for high-impact API routes.",
    });
  }
  if (!evidence.docs.some((doc) => doc.includes("Agents-and-Workflows"))) {
    risks.push({
      severity: "medium",
      title: "Agent workflow documentation is missing",
      detail: "The system needs a durable place to explain how agents coordinate.",
      evidence: evidence.docs.slice(0, 5),
      recommendation: "Keep wiki/Agents-and-Workflows.md current whenever agent boundaries change.",
    });
  }
  if (!risks.length) {
    risks.push({
      severity: "low",
      title: "Architecture map is connected",
      detail: "No major repo-evidence gap was detected in this pass.",
      evidence: [`${evidence.agentTypes.length} agent types`, `${evidence.skillIds.length} skill IDs`, `${evidence.docs.length} docs`],
      recommendation: "Keep the architecture report refreshed after agent, Prisma, or workflow changes.",
    });
  }
  return risks;
}

function recommendedDecisions(risks: ArchitectureRisk[]) {
  const decisions = ["Refresh the system architecture report after each agent, Prisma, or workflow release."];
  if (risks.some((risk) => risk.title.includes("skill policy"))) decisions.push("Do not add new AgentType values without matching skill registry policy coverage.");
  if (risks.some((risk) => risk.title.includes("API surfaces"))) decisions.push("Require workflow owner and approval-boundary notes for high-impact API routes.");
  decisions.push("Keep LangGraph for durable browser or agency state machines; keep deterministic services for synchronous analysis agents.");
  return decisions;
}

async function recordArchitectureEvents(run: AgentRun, output: SystemArchitectureOutput) {
  await prisma.agentRunEvent.createMany({
    data: [
      {
        agentRunId: run.id,
        type: "architecture_scan_completed",
        message: `Mapped ${output.metrics.appRoutes} page route(s), ${output.metrics.apiRoutes} API route(s), and ${output.metrics.agentTypes} agent type(s).`,
        payloadJson: output.metrics,
      },
      {
        agentRunId: run.id,
        type: "architecture_risks_ranked",
        message: `${output.risks.length} architecture risk item(s) ranked.`,
        payloadJson: { risks: output.risks.map((risk) => ({ severity: risk.severity, title: risk.title })) },
      },
    ],
  });
}

async function listFiles(root: string, predicate: (file: string) => boolean): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(root, entry.name);
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") return [];
      if (entry.isDirectory()) return listFiles(fullPath, predicate);
      return predicate(fullPath) ? [fullPath] : [];
    }));
    return files.flat();
  } catch {
    return [];
  }
}

async function readOptional(file: string) {
  try {
    return await readFile(file, "utf8");
  } catch {
    return "";
  }
}

function matches(input: string, regex: RegExp) {
  return Array.from(input.matchAll(regex)).map((match) => match[1] ?? match[0]).filter(Boolean);
}

function enumValues(schema: string, enumName: string) {
  const block = new RegExp(`enum\\s+${enumName}\\s+{([\\s\\S]*?)}`).exec(schema)?.[1] ?? "";
  return block.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("//"));
}

function routeFromPage(rootDir: string, file: string) {
  const route = relative(rootDir, file).replace(/^src\/app/, "").replace(/\/page\.tsx$/, "") || "/";
  return route.replace(/\/\(.*?\)/g, "").replace(/\/index$/, "") || "/";
}

function routeFromApi(rootDir: string, file: string) {
  const route = relative(rootDir, file).replace(/^src\/app\/api/, "/api").replace(/\/route\.ts$/, "");
  return route || "/api";
}

function relative(rootDir: string, file: string) {
  return path.relative(rootDir, file).replaceAll(path.sep, "/");
}

function node(id: string, label: string, kind: ArchitectureNode["kind"], summary: string): ArchitectureNode {
  return { id, label, kind, summary };
}

function toSkillId(agentType: string) {
  return agentType.toLowerCase();
}

function humanize(value: string) {
  return value.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function hasDocMention(route: string, docs: DocEvidence[]) {
  const routeMentions = routeMentionVariants(route);
  const familyMentions = routeFamilyMentionVariants(route);
  return docs.some((doc) => {
    const content = normalizeDocContent(doc.content);
    if (routeMentions.some((mention) => content.includes(mention))) return true;
    if (familyMentions.some((mention) => content.includes(mention))) return true;
    return routeFamilyParagraphs(route).some((family) => paragraphDocumentsFamily(content, family));
  });
}

function normalizeDocContent(content: string) {
  return content.toLowerCase().replaceAll("`", "");
}

function routeMentionVariants(route: string) {
  const variants = new Set<string>([
    route,
    route.replace(/\[[^\]]+\]/g, "[id]"),
    route.replace(/\[[^\]]+\]/g, ":id"),
    route.replace(/\[[^\]]+\]/g, "{id}"),
  ]);
  return Array.from(variants).map((variant) => variant.toLowerCase());
}

function routeFamilyMentionVariants(route: string) {
  const parts = route.split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "api") return [];
  const family = `/${parts.slice(0, 2).join("/")}`;
  return [
    `${family} route family`,
    `${family} route families`,
    `${family} routes`,
    `${family} api family`,
    `${family} api routes`,
  ].map((variant) => variant.toLowerCase());
}

function routeFamilyParagraphs(route: string) {
  const parts = route.split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "api") return [];
  return [`/${parts.slice(0, 2).join("/")}`.toLowerCase()];
}

function paragraphDocumentsFamily(content: string, family: string) {
  return content
    .split(/\n{2,}/)
    .some((paragraph) => paragraph.includes(family) && /\b(route famil|api route)/.test(paragraph));
}

function documentationSummary(doc: string) {
  if (doc === "README.md") return "Primary product and operations overview.";
  if (doc.startsWith("wiki/")) return "Workflow and operations documentation.";
  if (doc.startsWith(".agents/skills/")) return "Repo-local agent skill instructions.";
  return "Architecture memory artifact.";
}
