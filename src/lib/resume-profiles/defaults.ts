import type { Prisma } from "@prisma/client";

export type DefaultResumeProfile = {
  name: string;
  description: string;
  targetRoles: string[];
  positioningSummary: string;
  evidenceTags: string[];
  priorityProjects: string[];
  defaultSections: string[];
};

export const defaultResumeProfiles: DefaultResumeProfile[] = [
  {
    name: "Senior Frontend / Product Engineering",
    description: "General senior frontend positioning for React, TypeScript, SaaS, dashboards, and high-quality product execution.",
    targetRoles: ["Senior Frontend Engineer", "Staff Frontend Engineer", "Senior Product Engineer"],
    positioningSummary: "Senior frontend/product engineer focused on React, TypeScript, data-rich workflows, quality, and pragmatic product delivery.",
    evidenceTags: ["react", "typescript", "frontend", "saas", "dashboard", "testing"],
    priorityProjects: ["Job Search OS", "Progression Lab AI"],
    defaultSections: ["Summary", "Skills", "Professional Experience", "Projects", "Education"],
  },
  {
    name: "Security SaaS / Identity",
    description: "Security, identity, authentication, passkey, and admin-console positioning.",
    targetRoles: ["Senior Frontend Engineer", "Senior Full Stack Engineer", "Frontend Platform Engineer"],
    positioningSummary: "Frontend/full-stack engineer with security SaaS, authentication, passkey, WebAuthn, and enterprise admin workflow emphasis.",
    evidenceTags: ["security", "identity", "auth", "webauthn", "passkeys", "admin-console"],
    priorityProjects: ["webauthn-core", "Progression Lab AI"],
    defaultSections: ["Summary", "Security & Identity Skills", "Professional Experience", "Projects", "Education"],
  },
  {
    name: "AI Product Engineer",
    description: "AI product workflows, structured outputs, human review, and full-stack SaaS positioning.",
    targetRoles: ["AI Product Engineer", "Senior Full Stack Engineer", "Developer Tools Engineer"],
    positioningSummary: "Full-stack product engineer building AI-assisted workflows with structured outputs, reviewable automation, and production SaaS foundations.",
    evidenceTags: ["ai-product", "openai", "structured-outputs", "nextjs", "full-stack", "saas"],
    priorityProjects: ["Progression Lab AI", "Job Search OS"],
    defaultSections: ["Summary", "AI Product Skills", "Professional Experience", "Projects", "Education"],
  },
  {
    name: "Defense / Mission Software UI",
    description: "Defense-adjacent mission software, visualization, simulation, and operator-tool positioning.",
    targetRoles: ["Mission Software Engineer", "Senior UI Engineer", "Visualization Engineer", "Full Stack Engineer"],
    positioningSummary: "Frontend/product engineer positioned for mission software, operational dashboards, simulation, visualization, and human-centered complex tooling.",
    evidenceTags: ["defense-tech", "mission-software", "data-visualization", "geospatial", "react", "typescript"],
    priorityProjects: ["EMF Disturbance Simulator", "Job Search OS"],
    defaultSections: ["Summary", "Mission UI Skills", "Professional Experience", "Projects", "Education"],
  },
  {
    name: "Design Systems / Platform UI",
    description: "Design systems, Storybook, component quality, frontend platform, and art-direction plus engineering positioning.",
    targetRoles: ["Design Systems Engineer", "Frontend Platform Engineer", "Staff Frontend Engineer"],
    positioningSummary: "Senior frontend engineer with design systems, Storybook, component architecture, visual craft, and product-team enablement emphasis.",
    evidenceTags: ["design-systems", "storybook", "frontend-platform", "react", "typescript", "testing"],
    priorityProjects: ["Job Search OS", "Progression Lab AI"],
    defaultSections: ["Summary", "Frontend Platform Skills", "Professional Experience", "Projects", "Education"],
  },
  {
    name: "Full-Stack SaaS",
    description: "Full-stack SaaS, APIs, databases, auth, payments, admin controls, and product engineering positioning.",
    targetRoles: ["Senior Full Stack Engineer", "Full-Stack Product Engineer", "Founding Engineer"],
    positioningSummary: "Full-stack SaaS engineer focused on React, TypeScript, Next.js, APIs, Postgres, auth, payments, and admin workflows.",
    evidenceTags: ["full-stack", "nextjs", "node", "postgres", "auth", "stripe", "admin-console"],
    priorityProjects: ["Progression Lab AI", "Job Search OS", "webauthn-core"],
    defaultSections: ["Summary", "Full-Stack Skills", "Professional Experience", "Projects", "Education"],
  },
];

export function resumeProfileJson(value: string[]): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
