from __future__ import annotations

import html
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)


OUTPUT = Path("output/pdf/carl-welch-master-resume.pdf")


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def bullet(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(f"- {esc(text)}", style)


def role(
    title: str,
    dates: str,
    skills: str,
    bullets: list[str],
    styles: dict[str, ParagraphStyle],
    keep: bool = True,
) -> list:
    parts = [
        p(f"<b>{esc(title)}</b> | {esc(dates)}", styles["role"]),
        p(f"<b>Skills:</b> {esc(skills)}", styles["skills_line"]),
    ]
    parts.extend(bullet(item, styles["bullet"]) for item in bullets)
    parts.append(Spacer(1, 4))
    return [KeepTogether(parts)] if keep else parts


def compact_role(
    title: str,
    dates: str,
    skills: str,
    summary: str,
    styles: dict[str, ParagraphStyle],
) -> list:
    return [
        KeepTogether(
            [
                p(f"<b>{esc(title)}</b> | {esc(dates)}", styles["role"]),
                p(f"<b>Skills:</b> {esc(skills)}", styles["skills_line"]),
                p(esc(summary), styles["body"]),
                Spacer(1, 3),
            ]
        )
    ]


def section(title: str, styles: dict[str, ParagraphStyle]) -> list:
    return [Spacer(1, 4), p(esc(title.upper()), styles["section"]), Spacer(1, 2)]


def build() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    styles = getSampleStyleSheet()
    resume_styles: dict[str, ParagraphStyle] = {
        "name": ParagraphStyle(
            "Name",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=17,
            alignment=TA_CENTER,
            spaceAfter=2,
        ),
        "contact": ParagraphStyle(
            "Contact",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=7.7,
            leading=9,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#333333"),
            spaceAfter=5,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.4,
            leading=9.5,
            textColor=colors.HexColor("#111111"),
            borderWidth=0,
            borderPadding=0,
            spaceBefore=1,
            spaceAfter=1,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=7.65,
            leading=8.9,
            spaceAfter=2,
        ),
        "skills": ParagraphStyle(
            "Skills",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=7.25,
            leading=8.4,
            spaceAfter=3,
        ),
        "role": ParagraphStyle(
            "Role",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8.0,
            leading=9.1,
            spaceBefore=2,
            spaceAfter=0.6,
        ),
        "skills_line": ParagraphStyle(
            "SkillsLine",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=6.9,
            leading=7.8,
            textColor=colors.HexColor("#333333"),
            spaceAfter=0.5,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=7.15,
            leading=8.25,
            leftIndent=7,
            firstLineIndent=-7,
            spaceAfter=0.35,
        ),
    }

    story: list = []
    story.append(p("<b>Carl Welch</b>", resume_styles["name"]))
    story.append(
        p(
            "carlwelchdesign@gmail.com | 1-805-403-4819 | linkedin.com/in/carlwelch | github.com/carlwelchdesign",
            resume_styles["contact"],
        )
    )

    story.extend(section("Summary", resume_styles))
    story.append(
        p(
            esc(
                "Senior Software Engineer with 20+ years of experience building enterprise web applications, developer platforms, mobile apps, media systems, analytics tools, and high-impact internal platforms. Strong background in React, TypeScript, Node.js, API integrations, frontend architecture, test automation, component systems, and customer-facing workflow design. Experienced leading engineers, partnering with product, backend, design, and QA teams, and delivering scalable systems across identity, SaaS, sales engagement, mobility, analytics, media, advertising, and defense training domains."
            ),
            resume_styles["body"],
        )
    )

    story.extend(section("Core Skills", resume_styles))
    story.append(
        p(
            esc(
                "React, TypeScript, JavaScript, Node.js, API Design, REST APIs, Backend-for-Frontend, Material UI, Storybook, Jest, Playwright, React Native, Redux, Redux-Saga, Backbone, Angular, PHP, MySQL, PostgreSQL, Docker, Kubernetes, Redis, Elasticsearch, Google Maps API, Stripe, Twilio, Firebase, WebSockets, AWS, Three.js, Canvas, Adobe Flash, Video Platforms, Analytics, CMS, Accessibility, Frontend Architecture, Test Automation, Developer Experience"
            ),
            resume_styles["skills"],
        )
    )

    story.extend(section("Professional Experience", resume_styles))
    story.extend(
        role(
            "Yubico - Senior Software Engineer",
            "Jul 2022 - Mar 2026",
            "React, TypeScript, Node.js, AWS, Material UI, Storybook, Jest, Playwright, API Integrations",
            [
                "Built enterprise admin console features supporting YubiKey management, provisioning flows, inventory and shipping workflows, and device lifecycle management for enterprise admins and identity teams.",
                "Designed and implemented notification workflows for user-facing alerts, shipment updates, provisioning status, admin announcements, error notifications, email notifications, and in-app notifications.",
                "Partnered with backend and product teams on API contracts, frontend architecture, feature planning, rollout sequencing, and enterprise workflow design.",
                "Led Storybook adoption and shared component library work, improving component reuse, local development speed, release confidence, and cross-team frontend consistency.",
                "Increased test automation by 50% using Jest and Playwright while reducing QA time, regressions, support issues, and release risk.",
                "Mentored engineers, reviewed PRs, defined frontend standards, coordinated with design, QA, and backend teams, and contributed to release planning.",
            ],
            resume_styles,
        )
    )
    story.extend(
        role(
            "Revenue.io - Senior Software Engineer",
            "Mar 2020 - Jul 2022",
            "React, TypeScript, Node.js, Backend-for-Frontend, Backbone, Docker, Jest, Storybook",
            [
                "Built analytics dashboards, call and communication workflows, sales engagement tools, reporting views, admin tools, and customer-facing SaaS interfaces.",
                "Integrated Salesforce, HubSpot, Outreach, Salesloft, Twilio, telephony APIs, email and calendar workflows, and internal APIs.",
                "Migrated legacy Backbone screens to React and TypeScript, introducing shared components, improving test coverage, reducing bugs, and modernizing frontend architecture.",
                "Improved sales team productivity by reducing friction across CRM, telephony, reporting, and communication workflows.",
                "Supported faster page loads, better reporting speed, fewer support issues, stronger test coverage, and broader adoption by sales teams.",
            ],
            resume_styles,
        )
    )
    story.extend(
        role(
            "Bosch - Lead Frontend Developer",
            "Jul 2018 - Mar 2020",
            "React Native, TypeScript, Java, Xcode, Google Maps API, Stripe, Redis, Firebase, WebSockets, Twilio",
            [
                "Led frontend and mobile development for a B2B ride-sharing application supporting Bosch employees, corporate commuters, internal mobility programs, and fleet logistics.",
                "Built scheduling, routing/maps, payments, messaging, real-time driver/rider updates, localization, and app store release workflows.",
                "Coordinated with backend, product, design, QA, and international stakeholders across US, Mexico, and Germany launches.",
                "Managed mobile release planning for Apple App Store and Google Play approval while improving release speed and operational reliability.",
                "Mentored engineers, defined mobile/frontend architecture, and supported real-time communication and payment workflows.",
            ],
            resume_styles,
        )
    )
    story.extend(
        role(
            "Bridg - Senior Frontend Engineer",
            "Dec 2017 - Aug 2018",
            "React, TypeScript, Jest, Kubernetes, Elasticsearch Schemas, API Design",
            [
                "Built analytics dashboards, segmentation workflows, reporting tools, search/filtering experiences, and data visualization features for restaurant and retail intelligence.",
                "Helped brands understand customers, segment audiences, measure campaigns, analyze transactions, and improve loyalty and marketing decisions.",
                "Defined frontend architecture, component patterns, API contracts, and testing standards while mentoring engineers and reviewing PRs.",
                "Improved app performance, dashboard responsiveness, query/search usability, maintainability, and engineering delivery quality.",
            ],
            resume_styles,
        )
    )
    story.extend(
        role(
            "Grindr - Senior Web Developer / Manager",
            "Apr 2016 - Aug 2017",
            "React, JavaScript, Sass, Go, Analytics, CMS, Computer Vision, Mobile Campaigns",
            [
                "Built internal marketing tools, high-traffic web properties, campaign platforms, ad tooling, backend/admin tools, and analytics-driven workflows.",
                "Developed an in-app ad campaign package tool that automated creative generation, resizing/cropping, metadata packaging, targeting rules, QA checks, exports, mobile handoff, and analytics integration, improving workflow efficiency by 2400%.",
                "Built a content website and CMS with editorial publishing, ad placement, analytics, content workflows, campaign pages, and backend/admin tooling, contributing to a 300% revenue increase.",
                "Built Gaymoji keyboard experiences including keyboard UI, emoji/sticker asset systems, mobile integrations, campaign landing pages, app store support, analytics, and admin tools.",
                "Created an augmented-reality/computer-vision campaign experience where users triggered animated emoji from physical Grindr advertisements.",
                "Managed developers, reviewed code, planned campaigns/releases, and coordinated with marketing, product, design, mobile teams, vendors, and stakeholders.",
            ],
            resume_styles,
            keep=False,
        )
    )

    story.append(PageBreak())
    story.extend(section("Earlier Experience", resume_styles))
    story.extend(
        compact_role(
            "SapientNitro - Manager, Interactive Development",
            "2015 - 2016",
            "JavaScript, React, Angular, Backbone, SCSS, Node.js, PHP, MySQL, Social Media APIs",
            "Led frontend architecture and onsite forward-deployed development for major retail and entertainment brands. Managed developers, estimated work, reviewed code, coordinated with design/product/account teams, launched high-traffic campaigns and sites, improved delivery speed, and built reusable components across clients.",
            resume_styles,
        )
    )
    story.extend(
        compact_role(
            "Nezzoh Studios - Technical Director",
            "Dec 2013 - Dec 2014",
            "JavaScript, PHP, MySQL, Chromecast, Roku APIs, Kaltura, Analytics, Video Accessibility",
            "Led video platform development, Chromecast streaming work for Fox Studios, Kaltura player plugins, analytics integrations, ad plugins, Flash/HTML5 player parity, accessibility/captioning support, and developer support for major media networks including Disney, Fox, and CBS.",
            resume_styles,
        )
    )
    story.extend(
        compact_role(
            "Trailer Park Studios - Lead Developer",
            "Sep 2012 - Sep 2013",
            "JavaScript, jQuery, CSS, Flash, Three.js, Canvas, PHP, MySQL, Backbone, Node.js",
            "Led interactive entertainment marketing work for major studios, including Warner Bros. campaign work for The Conjuring. Built admin tools, interactive frontend experiences, Apple iBooks widgets, and helped recover a failing project while overseeing five junior developers.",
            resume_styles,
        )
    )
    story.extend(
        compact_role(
            "BPG Advertising - Interactive Art Director / Front End Developer, Contract",
            "May 2012 - Jul 2012",
            "JavaScript, jQuery, CSS, Flash, Three.js, Canvas, PHP, MySQL, Backbone, Node.js",
            "Built entertainment marketing sites, interactive campaigns, microsites, Flash ads, campaign landing pages, CMS/admin tools, and social integrations for major entertainment studios.",
            resume_styles,
        )
    )
    story.extend(
        compact_role(
            "Petrol - Interactive Art Director / Full Stack Developer",
            "Sep 2011 - Feb 2012",
            "HTML, CSS, JavaScript, jQuery, PHP, MySQL, Localization, Three.js, Canvas, Flash",
            "Built movie and game marketing sites, microsites, interactive campaigns, Flash ads, social integrations, analytics, frontend/backend systems, and campaign experiences for brands including Sony PlayStation, UFC, Metal Gear Solid, Dark Souls, and Dragon's Dogma.",
            resume_styles,
        )
    )
    story.extend(
        compact_role(
            "TASER International / AXON - Front End Developer",
            "Apr 2009 - Oct 2011",
            "JavaScript, HTML5, CSS, jQuery, Flash, Google Maps API, PHP, MySQL, Video Player Development, Encryption",
            "Built AXON officer dashboard features for body-camera video review, GPS/map playback, evidence annotation, case file preparation, upload/download flows, secure packaging, and video player tooling. Supported high-volume video files, synchronized GPS/video playback, secure evidence transfer, and prosecutor/court export workflows.",
            resume_styles,
        )
    )
    story.extend(
        compact_role(
            "General Dynamics Land Systems - Manager / Lead Developer",
            "2001 - 2004",
            "VR/AR Hardware, Visual Basic, C++, Macromedia Director 3D, CAD, AutoCAD",
            "Led VR/AR training and maintenance simulation programs for Stryker combat vehicle scenarios. Built interactive 3D instruction, vehicle simulations, defense training demos, and hardware/software prototypes while coordinating academic and defense stakeholders.",
            resume_styles,
        )
    )

    story.extend(section("Projects", resume_styles))
    story.append(
        p(
            "<b>Job Search OS</b> - "
            + esc(
                "Local-first AI-powered job search operating system with specialized agents, RAG over approved career evidence, job scoring, resume and cover letter generation, application QA, recruiter outreach, outcome learning, and controlled browser workflows. Skills: Next.js, TypeScript, React, Prisma, PostgreSQL, pgvector, Redis, Docker, OpenAI structured outputs, RAG, MCP, LangGraph, LangChain, Playwright, Server-Sent Events, Material UI, Vitest"
            ),
            resume_styles["body"],
        )
    )

    story.extend(section("Education", resume_styles))
    story.append(
        p(
            "Virginia Commonwealth University - Bachelor of Fine Arts",
            resume_styles["body"],
        )
    )

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=LETTER,
        rightMargin=33,
        leftMargin=33,
        topMargin=28,
        bottomMargin=28,
        title="Carl Welch Master Resume",
        author="Carl Welch",
        subject="Senior Software Engineer Resume",
    )
    doc.build(story)


if __name__ == "__main__":
    build()
