import type { ExperienceBullet, GithubRepository, Project, UserProfile, WorkExperience } from "@prisma/client";
import { z } from "zod";
import { parseStructuredOutput } from "@/lib/ai/openai";
import type { AnswerMemoryMatch } from "@/lib/application-answer-memory";

export const applicationQuestionAnswerSchema = z.object({
  options: z.array(
    z.object({
      title: z.string(),
      answer: z.string(),
      evidence: z.array(z.string()).default([]),
      tone: z.string(),
      cautions: z.array(z.string()).default([]),
    }),
  ).min(3).max(3),
});

type ApplicationQuestionInput = {
  question: string;
  userProfile: UserProfile;
  bullets: ExperienceBullet[];
  workExperiences: WorkExperience[];
  projects: Project[];
  githubRepositories: GithubRepository[];
  answerMemory?: AnswerMemoryMatch[];
};

export async function answerApplicationQuestion(input: ApplicationQuestionInput) {
  const fallback = fallbackAnswers(input);

  try {
    const generated = await parseStructuredOutput({
      schema: applicationQuestionAnswerSchema,
      schemaName: "answer_application_question",
      system:
        "Draft three concise application-question answer options for a senior software engineer. " +
        "Use only the supplied approved candidate profile, verified experience bullets, work history, projects, and GitHub repositories. " +
        "Answer the employer's actual question type; do not turn motivation, industry, culture, or values questions into unrelated project stories. " +
        "Do not fabricate employers, project outcomes, metrics, credentials, or personal stories. " +
        "Keep answers credible, specific, human, and easy for the user to edit. Avoid hype, cliches, and em dashes.",
      input: {
        question: input.question,
        candidateProfile: {
          fullName: input.userProfile.fullName,
          summary: input.userProfile.professionalSummary ?? input.userProfile.masterSummary,
          yearsExperience: input.userProfile.yearsExperience,
          primaryRoles: input.userProfile.primaryRoles,
          coreSkills: input.userProfile.coreSkills,
          technicalSkills: input.userProfile.technicalSkills,
          industries: input.userProfile.industries,
          domainExpertise: input.userProfile.domainExpertise,
        },
        verifiedBullets: input.bullets.slice(0, 80).map((bullet) => ({
          company: bullet.company,
          role: bullet.role,
          category: bullet.category,
          text: bullet.text,
          keywords: bullet.keywords,
        })),
        workExperience: input.workExperiences.slice(0, 30).map((work) => ({
          company: work.company,
          title: work.title,
          startDate: work.startDate,
          endDate: work.endDate,
          summary: work.summary,
          skills: work.skills,
          achievements: work.achievements,
        })),
        projects: input.projects.slice(0, 20).map((project) => ({
          name: project.name,
          description: project.description,
          url: project.url,
          repoUrl: project.repoUrl,
          technologies: project.technologies,
          highlights: project.highlights,
        })),
        githubRepositories: input.githubRepositories.filter((repo) => !repo.isFork).slice(0, 25).map((repo) => ({
          name: repo.name,
          fullName: repo.fullName,
          url: repo.htmlUrl,
          description: repo.description,
          language: repo.language,
          topics: repo.topics,
          stars: repo.stars,
          pushedAt: repo.pushedAt,
        })),
        reusableAnswerMemory: input.answerMemory?.map((memory) => ({
          previousQuestion: memory.questionText,
          answer: memory.answer,
          sensitivity: memory.sensitivity,
          reusePolicy: memory.reusePolicy,
          matchScore: memory.matchScore,
          instruction: memory.autoUsable
            ? "This low-sensitivity answer may be reused if it fits the current question."
            : "Use as context only. The user should review before reuse.",
        })),
      },
    });

    return {
      generatedBy: generated ? "openai_structured_outputs" : "deterministic_fallback",
      ...(generated ?? fallback),
    };
  } catch (error) {
    console.warn("OpenAI application question helper failed; using deterministic fallback.", error);
    return { generatedBy: "deterministic_fallback", ...fallback };
  }
}

function fallbackAnswers(input: ApplicationQuestionInput) {
  if (isIndustryMotivationQuestion(input.question)) return industryMotivationFallback(input);
  return projectChallengeFallback(input);
}

function industryMotivationFallback({ question, userProfile, bullets, projects, githubRepositories, answerMemory = [] }: ApplicationQuestionInput) {
  const normalized = question.toLowerCase();
  const industry = normalized.includes("cryptocurrency") || normalized.includes("crypto") || normalized.includes("web3")
    ? "cryptocurrency"
    : "this industry";
  const summary = userProfile.professionalSummary ?? userProfile.masterSummary ?? "I build practical product experiences for complex, high-trust workflows.";
  const trustBullets = findRelevantBullets(bullets, /security|identity|provision|enterprise|api|workflow|reliable|trust|configuration|integration/i, 3);
  const productBullets = findRelevantBullets(bullets, /frontend|product|workflow|dashboard|user|design|react|typescript|material ui|component/i, 3);
  const automationBullets = findRelevantBullets(bullets, /automation|agent|ai|tool|github|data|scoring|workflow|local|integration/i, 3);
  const repos = githubRepositories.filter((repo) => !repo.isFork).slice(0, 2);
  const project = projects[0];
  const memory = answerMemory[0];

  return {
    options: withOptionalMemory(memory, [
      {
        title: "Trust And Usability Angle",
        answer: [
          `What excites me most about the ${industry} industry is the combination of technical depth, trust, and usability.`,
          "The space asks engineers to make complex systems feel understandable without hiding the risks or tradeoffs from users.",
          trustBullets[0]?.text ?? summary,
          "That kind of work fits how I like to build: clear interfaces, reliable workflows, and careful engineering around areas where user confidence matters.",
        ].join(" "),
        evidence: formatBulletEvidence(trustBullets),
        tone: "Grounded, mature, and trust-focused.",
        cautions: [`This does not claim direct ${industry} production experience unless you add a verified example.`],
      },
      {
        title: "Product Infrastructure Angle",
        answer: [
          `I am excited by ${industry} because it is still a young product and infrastructure space, which means there is room to build tools that make hard concepts more usable.`,
          "My strongest work has been in turning complicated workflows into interfaces and systems that people can actually operate with confidence.",
          productBullets[0]?.text ?? summary,
          "That is the kind of engineering challenge I would want to bring to a crypto product: practical, user-aware, and disciplined about quality.",
        ].join(" "),
        evidence: formatBulletEvidence(productBullets),
        tone: "Product-minded and pragmatic.",
        cautions: ["Tune the final sentence to the specific company's product, customers, and risk posture."],
      },
      {
        title: "Builder Curiosity Angle",
        answer: [
          `The ${industry} industry excites me because it rewards builders who can learn quickly, evaluate new patterns honestly, and ship useful software without losing sight of reliability.`,
          repos[0]
            ? `My independent work on ${repos[0].name} reflects that same builder mindset: taking a complex workflow and tightening the loop between data, automation, and user decisions.`
            : project
              ? `My work on ${project.name} reflects that same builder mindset: taking a complex workflow and making it clearer and more usable.`
              : "That aligns with how I approach engineering: learn the domain, reduce ambiguity, and build software that helps people make better decisions.",
          "I am especially interested in teams that treat crypto as a serious product and systems problem, not just a trend.",
        ].join(" "),
        evidence: [
          ...formatBulletEvidence(automationBullets),
          ...repos.map((repo) => `${repo.name}: ${[repo.description, repo.language, repo.htmlUrl].filter(Boolean).join(" | ")}`),
        ].slice(0, 3),
        tone: "Curious, current, and builder-oriented.",
        cautions: ["Keep this option if the employer values startup energy or rapid learning."],
      },
    ]),
  };
}

function projectChallengeFallback({ question, userProfile, bullets, projects, githubRepositories, answerMemory = [] }: ApplicationQuestionInput) {
  const strongestBullets = bullets.slice(0, 6);
  const repos = githubRepositories.filter((repo) => !repo.isFork).slice(0, 3);
  const project = projects[0];
  const summary = userProfile.professionalSummary ?? userProfile.masterSummary ?? "I focus on building practical, maintainable product experiences for complex workflows.";
  const memory = answerMemory[0];

  return {
    options: withOptionalMemory(memory, [
      {
        title: "Product Engineering Challenge",
        answer: [
          "One project I am proud of is building complex enterprise product workflows where the UI had to make difficult operational tasks feel clear and reliable.",
          strongestBullets[0]?.text ?? summary,
          "The part I value most is that the work combined product judgment, frontend architecture, API integration, and careful interaction design rather than treating the UI as a thin layer.",
        ].join(" "),
        evidence: strongestBullets.slice(0, 2).map((bullet) => `${bullet.company}: ${bullet.text}`),
        tone: "Specific, product-focused, and senior.",
        cautions: ["Review the wording before submitting so it matches the employer's question exactly."],
      },
      {
        title: "Developer Experience / Platform Angle",
        answer: [
          "A challenge I would highlight is improving the developer and product experience around reusable frontend systems.",
          strongestBullets.find((bullet) => /storybook|component|design system|tooling|developer/i.test(bullet.text))?.text ?? strongestBullets[1]?.text ?? summary,
          "I am proud of that type of work because it compounds across teams: better components, clearer contracts, and better local tooling make every later feature easier to build and maintain.",
        ].join(" "),
        evidence: strongestBullets.filter((bullet) => /storybook|component|design system|tooling|developer|frontend/i.test(bullet.text)).slice(0, 3).map((bullet) => `${bullet.company}: ${bullet.text}`),
        tone: "Platform-oriented and pragmatic.",
        cautions: ["Add a concrete metric if you have one verified for this example."],
      },
      {
        title: "GitHub / Independent Work Angle",
        answer: [
          repos[0]
            ? `One example I would discuss is ${repos[0].name}, which reflects how I keep building and testing product ideas outside of day-to-day work.`
            : project
              ? `One example I would discuss is ${project.name}, because it shows how I approach projects from implementation through usability.`
              : "One example I would discuss is my ongoing independent engineering work, because it shows how I keep sharpening product and implementation judgment.",
          repos[0]?.description ?? project?.description ?? "I tend to focus on practical tools, clear workflows, and software that can be reviewed and improved iteratively.",
          "That matters to me because the best engineering work usually comes from repeatedly tightening the loop between user need, implementation quality, and honest feedback.",
        ].join(" "),
        evidence: repos.map((repo) => `${repo.name}: ${[repo.description, repo.language, repo.htmlUrl].filter(Boolean).join(" | ")}`),
        tone: "Personal, current, and project-based.",
        cautions: ["Use this option only if the question allows examples from public or independent work."],
      },
    ]),
  };
}

function isIndustryMotivationQuestion(question: string) {
  const normalized = question.toLowerCase();
  return (
    /\b(what|why)\b.*\b(excites|interests|motivates|draws|attracts)\b.*\b(industry|space|sector|field|crypto|cryptocurrency|web3|blockchain)\b/.test(normalized) ||
    /\bwhy\b.*\b(work|join|interested)\b.*\b(crypto|cryptocurrency|web3|blockchain)\b/.test(normalized)
  );
}

function withOptionalMemory(
  memory: AnswerMemoryMatch | undefined,
  options: Array<{ title: string; answer: string; evidence: string[]; tone: string; cautions: string[] }>,
) {
  return [
    ...(memory ? [{
      title: memory.autoUsable ? "Saved Answer" : "Saved Answer To Review",
      answer: memory.answer,
      evidence: [`Saved answer memory from: ${memory.questionText}`],
      tone: memory.autoUsable ? "Previously approved and low-sensitivity." : "Previously saved, review before use.",
      cautions: memory.autoUsable ? [] : ["Review this saved answer before submitting because it may not exactly match the current question."],
    }] : []),
    ...options,
  ].slice(0, 3);
}

function findRelevantBullets(bullets: ExperienceBullet[], pattern: RegExp, limit: number) {
  return bullets.filter((bullet) => pattern.test([bullet.company, bullet.role, bullet.category, bullet.text, keywordsText(bullet.keywords)].join(" "))).slice(0, limit);
}

function formatBulletEvidence(bullets: ExperienceBullet[]) {
  return bullets.map((bullet) => `${bullet.company}: ${bullet.text}`);
}

function keywordsText(value: ExperienceBullet["keywords"]) {
  if (!value) return "";
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join(" ");
  if (typeof value === "string") return value;
  return "";
}
