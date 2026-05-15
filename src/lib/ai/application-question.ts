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

function fallbackAnswers({ question, userProfile, bullets, projects, githubRepositories, answerMemory = [] }: ApplicationQuestionInput) {
  const strongestBullets = bullets.slice(0, 6);
  const repos = githubRepositories.filter((repo) => !repo.isFork).slice(0, 3);
  const project = projects[0];
  const summary = userProfile.professionalSummary ?? userProfile.masterSummary ?? "I focus on building practical, maintainable product experiences for complex workflows.";
  const memory = answerMemory[0];

  return {
    options: [
      ...(memory ? [{
        title: memory.autoUsable ? "Saved Answer" : "Saved Answer To Review",
        answer: memory.answer,
        evidence: [`Saved answer memory from: ${memory.questionText}`],
        tone: memory.autoUsable ? "Previously approved and low-sensitivity." : "Previously saved, review before use.",
        cautions: memory.autoUsable ? [] : ["Review this saved answer before submitting because it may not exactly match the current question."],
      }] : []),
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
    ].slice(0, 3),
  };
}
