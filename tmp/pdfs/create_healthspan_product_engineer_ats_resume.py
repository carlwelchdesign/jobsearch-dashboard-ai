from __future__ import annotations

import html
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)


OUTPUT = Path("output/pdf/carl-welch-healthspan-product-engineer-ats-resume.pdf")


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def paragraph(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def bullet(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(f"- {esc(text)}", style)


def section(title: str, styles: dict[str, ParagraphStyle]) -> list:
    return [Spacer(1, 10), paragraph(esc(title.upper()), styles["section"]), Spacer(1, 4)]


def role(
    title: str,
    dates: str,
    skills: str,
    bullets: list[str],
    styles: dict[str, ParagraphStyle],
) -> list:
    parts = [
        paragraph(f"<b>{esc(title)}</b> | {esc(dates)}", styles["role"]),
        paragraph(f"<b>Skills:</b> {esc(skills)}", styles["skills_line"]),
    ]
    parts.extend(bullet(item, styles["bullet"]) for item in bullets)
    parts.append(Spacer(1, 8))
    return [KeepTogether(parts[:3]), *parts[3:]]


def compact_role(
    title: str,
    dates: str,
    skills: str,
    summary: str,
    styles: dict[str, ParagraphStyle],
) -> list:
    heading = f"<b>{esc(title)}</b>"
    if dates:
        heading = f"{heading} | {esc(dates)}"
    return [
        paragraph(heading, styles["role"]),
        paragraph(f"<b>Skills:</b> {esc(skills)}", styles["skills_line"]),
        paragraph(esc(summary), styles["body"]),
        Spacer(1, 7),
    ]


def build_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "name": ParagraphStyle(
            "Name",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            alignment=TA_CENTER,
            spaceAfter=4,
        ),
        "contact": ParagraphStyle(
            "Contact",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=14,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#222222"),
            spaceAfter=12,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=colors.HexColor("#111111"),
            spaceAfter=2,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=14.5,
            spaceAfter=5,
        ),
        "skills": ParagraphStyle(
            "Skills",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=14.5,
            spaceAfter=6,
        ),
        "role": ParagraphStyle(
            "Role",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=14,
            spaceBefore=4,
            spaceAfter=2,
        ),
        "skills_line": ParagraphStyle(
            "SkillsLine",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=14,
            textColor=colors.HexColor("#333333"),
            spaceAfter=3,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            leading=14.5,
            leftIndent=12,
            firstLineIndent=-12,
            spaceAfter=3,
        ),
    }


def build() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = build_styles()

    story: list = [
        paragraph("<b>Carl Welch</b>", styles["name"]),
        paragraph(
            "carlwelchdesign@gmail.com | 1-805-403-4819 | https://www.linkedin.com/in/carlwelch | https://github.com/carlwelchdesign",
            styles["contact"],
        ),
    ]

    story.extend(section("Professional Summary", styles))
    story.append(
        paragraph(
            esc(
                "Senior Product / Frontend Engineer with 20+ years building polished, data-rich product surfaces across enterprise SaaS, identity, analytics, mobile, internal tools, and workflow automation. Strong React, TypeScript, Next.js, API integration, component systems, testing, and product-partnering background. Recently built Job Search OS, an AI-native workflow product using MCP, RAG, agent workflows, Prisma/Postgres, pgvector, LangGraph, and Playwright with human review, evidence grounding, claim provenance, audit history, and manual final-action gates. Strongest where designs, ambiguous requirements, edge cases, AI behavior, trust boundaries, and production-quality UI all meet."
            ),
            styles["body"],
        )
    )

    story.extend(section("Core Skills", styles))
    story.append(
        paragraph(
            esc(
                "React, TypeScript, Next.js, JavaScript, Node.js, CSS, Sass, API integrations, REST APIs, frontend architecture, product surfaces, component systems, design systems, Storybook, Material UI, Jest, Playwright, Prisma, PostgreSQL, pgvector, Redis, Docker, MCP, Model Context Protocol, RAG, LangGraph, OpenAI structured outputs, agent workflows, human-in-the-loop AI, auth/security workflows, audit-friendly systems, analytics dashboards, internal tools, product copy, empty/error/loading states"
            ),
            styles["skills"],
        )
    )

    story.extend(section("Selected Product Build", styles))
    story.extend(
        role(
            "Job Search OS - AI-Native Workflow Product",
            "2026",
            "Next.js, React, TypeScript, Prisma, PostgreSQL, pgvector, Redis, OpenAI structured outputs, MCP, LangGraph, Playwright, Material UI, Vitest",
            [
                "Built a local-first AI job-search operating system that coordinates job discovery, evidence retrieval, fit scoring, resume and cover-letter generation, application packet QA, browser-assisted form prep, outcome learning, and human-in-the-loop approvals.",
                "Local production metrics include 4,632 tracked jobs, 2,383 profile matches, 177 recorded applications, 785 generated resumes, 1,573 cover letters, 183 submitted application packets, and 19,022 persisted agent runs.",
                "Designed AI workflow boundaries around evidence grounding, unsupported-claim detection, audit history, human approval gates, and manual final submission instead of unchecked automation.",
                "Built product surfaces for daily work queues, application prep, generated material review, agent status, search diagnostics, exception handling, and live Needs Me pauses.",
            ],
            styles,
        )
    )

    story.extend(section("Professional Experience", styles))
    story.extend(
        role(
            "Yubico - Senior Software Engineer",
            "Jul 2022 - Mar 2026",
            "React, TypeScript, Node.js, AWS, Material UI, Storybook, Jest, Playwright, API integrations, frontend architecture, component library, test automation, Redux, REST APIs",
            [
                "Built and maintained enterprise admin console features supporting YubiKey management, provisioning flows, inventory/shipping workflows, and device lifecycle management.",
                "Built enterprise identity and device-management workflows where clear state handling, secure user flows, auditability, and low-regression releases mattered.",
                "Increased test automation by 50% using Jest and Playwright while reducing QA time, regressions, support issues, and release risk.",
                "Led Storybook adoption and shared component library work, improving reuse, local development speed, and frontend consistency.",
                "Mentored engineers, reviewed PRs, defined frontend standards, coordinated with design, QA, and backend teams, and contributed to release planning.",
            ],
            styles,
        )
    )
    story.extend(
        role(
            "Revenue.io - Senior Software Engineer",
            "Mar 2020 - Jul 2022",
            "React, TypeScript, Node.js, Backend-for-Frontend, Backbone, Docker, Jest, Storybook, SaaS, analytics, Twilio, Redux, REST APIs",
            [
                "Built analytics dashboards, call/communication workflows, sales engagement tools, reporting views, admin tools, and customer-facing SaaS interfaces.",
                "Migrated legacy Backbone screens to React and TypeScript while introducing shared components and modern frontend patterns.",
                "Improved sales team productivity by reducing friction across CRM, telephony, reporting, and communication workflows.",
                "Supported faster page loads, stronger test coverage, fewer bugs, fewer support issues, and broader sales team adoption.",
                "Partnered with product, design, and backend teams to turn complex workflow needs into usable product surfaces.",
            ],
            styles,
        )
    )
    story.extend(
        role(
            "Bosch - Lead Frontend Developer",
            "Jul 2018 - Mar 2020",
            "React Native, TypeScript, Java, Xcode, Google Maps API, Stripe, Redis, Firebase, WebSockets, Twilio, frontend architecture, Redux, REST APIs",
            [
                "Led frontend/mobile development for a B2B ride-sharing app supporting Bosch employees, corporate commuters, and internal mobility programs.",
                "Built scheduling, routing/maps, payments, messaging, real-time driver/rider updates, localization, and release workflows.",
                "Managed Apple App Store and Google Play release planning while improving release speed and operational reliability.",
                "Coordinated with backend, product, design, QA, and international stakeholders across US, Mexico, and Germany launches.",
            ],
            styles,
        )
    )
    story.extend(
        role(
            "Bridg - Senior Frontend Engineer",
            "Dec 2017 - Aug 2018",
            "React, TypeScript, Jest, Kubernetes, Elasticsearch schemas, API design, analytics, frontend architecture, Redux, REST APIs",
            [
                "Built analytics dashboards, segmentation workflows, reporting tools, search/filtering experiences, and data visualization features.",
                "Helped restaurant/retail brands understand customers, segment audiences, measure campaigns, analyze transactions, and improve loyalty decisions.",
                "Improved dashboard responsiveness, query/search usability, maintainability, and engineering delivery quality.",
                "Defined frontend architecture, component patterns, API contracts, and testing standards while mentoring engineers and reviewing PRs.",
            ],
            styles,
        )
    )
    story.extend(
        role(
            "Grindr - Senior Web Developer / Manager",
            "Apr 2016 - Aug 2017",
            "React, JavaScript, Sass, Go, analytics, CMS, computer vision, mobile campaigns, Redux, REST APIs",
            [
                "Developed an in-app ad campaign package tool that automated creative generation, resizing/cropping, metadata packaging, targeting rules, QA checks, exports, mobile handoff, and analytics integration, improving workflow efficiency by 2400%.",
                "Built a content website and CMS with editorial publishing, ad placement, analytics, campaign pages, and backend/admin tooling, contributing to a 300% revenue increase.",
                "Built Gaymoji keyboard experiences including keyboard UI, emoji/sticker asset systems, mobile integrations, campaign landing pages, app store support, analytics, and admin tools.",
                "Managed developers, reviewed code, planned releases, and coordinated with marketing, product, design, mobile teams, vendors, and stakeholders.",
            ],
            styles,
        )
    )

    story.extend(section("Earlier Experience", styles))
    story.extend(
        compact_role(
            "SapientNitro - Manager, Interactive Development",
            "2015 - 2016",
            "JavaScript, React, Angular, Backbone, SCSS, Node.js, PHP, MySQL, social media APIs, frontend architecture, REST APIs",
            "Managed developers, estimated work, reviewed code, coordinated with design, product, and account teams, launched high-traffic campaigns and sites, and led frontend architecture for major retail and entertainment brands.",
            styles,
        )
    )
    story.extend(
        compact_role(
            "Nezzoh Studios - Technical Director",
            "Dec 2013 - Dec 2014",
            "JavaScript, PHP, MySQL, Chromecast, Roku APIs, Kaltura, analytics, video accessibility, REST APIs",
            "Led video platform development, Chromecast streaming work, Kaltura player plugins, analytics integrations, ad plugins, accessibility, closed captioning, vendor coordination, and technical direction for major media networks.",
            styles,
        )
    )
    story.extend(
        compact_role(
            "Trailer Park Studios - Lead Developer",
            "Sep 2012 - Sep 2013",
            "JavaScript, jQuery, CSS, Flash, Three.js, Canvas, PHP, MySQL, Backbone, Node.js, REST APIs",
            "Built admin tools, interactive frontend experiences, short-film contest moderation tooling, Apple iBooks widgets, and entertainment campaign work; oversaw five junior developers to recover a project near collapse.",
            styles,
        )
    )
    story.extend(
        compact_role(
            "BPG Advertising - Interactive Art Director / Front End Developer, Contract",
            "May 2012 - Jul 2012",
            "JavaScript, jQuery, CSS, Flash, Three.js, Canvas, PHP, MySQL, Backbone, Node.js, CMS, REST APIs",
            "Built entertainment marketing sites, interactive campaigns, microsites, Flash ads, landing pages, CMS/admin tools, and social integrations.",
            styles,
        )
    )
    story.extend(
        compact_role(
            "Petrol - Interactive Art Director / Full Stack Developer",
            "Sep 2011 - Feb 2012",
            "HTML, CSS, JavaScript, jQuery, PHP, MySQL, localization, Three.js, Canvas, Flash, analytics, REST APIs",
            "Built movie/game marketing sites, microsites, interactive campaigns, Flash ads, social integrations, analytics, and frontend/backend systems for entertainment brands.",
            styles,
        )
    )
    story.extend(
        role(
            "TASER International / AXON - Front End Developer",
            "Apr 2009 - Oct 2011",
            "JavaScript, HTML5, CSS, jQuery, Flash, Google Maps API, PHP, MySQL, video player development, encryption, REST APIs",
            [
                "Built AXON officer dashboard features for body-camera video review, GPS/map playback, evidence annotation, case preparation, secure packaging, and video tooling.",
                "Developed front-end workflows for early body-worn camera and digital evidence management systems.",
                "Supported high-volume video files, synchronized GPS/video playback, chain-of-custody workflows, secure evidence transfer, and prosecutor/court exports.",
            ],
            styles,
        )
    )
    story.extend(
        compact_role(
            "General Dynamics Land Systems - Manager / Lead Developer",
            "2001 - 2004",
            "VR/AR hardware, Visual Basic, C++, Macromedia Director 3D, CAD, AutoCAD, VR, AR, defense",
            "Received over $300K in funding from General Motors Defense Systems for VR and AR R&D projects; set up a VR lab and built proof-of-concept AR applications for engineering analysis, maintenance support, and virtual training.",
            styles,
        )
    )
    story.extend(
        compact_role(
            "U.S. Army - Persian Gulf Veteran, Forward Observer / Fire Support Specialist",
            "",
            "Mission-critical systems, structured communication, operational accuracy, map reading, coordinate calculation",
            "Operated early digital fire support communication tools, supported target identification and fire support coordination, and acted as liaison between U.S. troops and allied forces in high-pressure environments.",
            styles,
        )
    )

    story.extend(section("Projects", styles))
    story.append(
        bullet(
            "supraconscious-avatar-ai: Full-stack AI SaaS application that transforms journaling into structured reflection, surfacing patterns, contradictions, and behavioral insights over time. | TypeScript",
            styles["bullet"],
        )
    )
    story.append(
        bullet(
            "progression-lab-ai: AI-powered SaaS for generating chord progressions, voicings, and arrangement ideas with real-time playback, visualization, and sharing. | TypeScript, React, Next.js, PostgreSQL, OpenAI API, Jest, Material UI",
            styles["bullet"],
        )
    )
    story.append(
        bullet(
            "emf-disturbance-sim: Interactive 3D electromagnetic field lab built with Next.js and React Three Fiber to simulate emitter behavior, interference patterns, and contested RF zones in real time. | TypeScript",
            styles["bullet"],
        )
    )

    story.extend(section("Education", styles))
    story.append(paragraph("Virginia Commonwealth University - Bachelor of Fine Arts", styles["body"]))

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=LETTER,
        rightMargin=36,
        leftMargin=36,
        topMargin=48,
        bottomMargin=48,
        title="Carl Welch - Healthspan Product Engineer ATS Resume",
        author="Carl Welch",
    )
    doc.build(story)


if __name__ == "__main__":
    build()
