from __future__ import annotations

import html
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer


OUTPUT = Path("output/pdf/carl-welch-master-resume-3-page.pdf")


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def paragraph(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text, style)


def bullet(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(f"- {esc(text)}", style)


def section(title: str, styles: dict[str, ParagraphStyle]) -> list:
    return [Spacer(1, 5), paragraph(esc(title.upper()), styles["section"]), Spacer(1, 2)]


def role(
    title: str,
    dates: str,
    skills: str,
    bullets: list[str],
    styles: dict[str, ParagraphStyle],
) -> list:
    content = [
        paragraph(f"<b>{esc(title)}</b> | {esc(dates)}", styles["role"]),
        paragraph(f"<b>Skills:</b> {esc(skills)}", styles["skills_line"]),
    ]
    content.extend(bullet(item, styles["bullet"]) for item in bullets)
    content.append(Spacer(1, 5))
    return [KeepTogether(content)]


def build() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    base = getSampleStyleSheet()
    styles: dict[str, ParagraphStyle] = {
        "name": ParagraphStyle(
            "Name",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=17,
            leading=19,
            alignment=TA_CENTER,
            spaceAfter=2,
        ),
        "contact": ParagraphStyle(
            "Contact",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.2,
            leading=9.4,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#333333"),
            spaceAfter=6,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9.2,
            leading=10.4,
            textColor=colors.HexColor("#111111"),
            spaceAfter=1,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.45,
            leading=9.9,
            spaceAfter=3,
        ),
        "skills": ParagraphStyle(
            "Skills",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7.9,
            leading=9.2,
            spaceAfter=4,
        ),
        "role": ParagraphStyle(
            "Role",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.9,
            leading=10.2,
            spaceBefore=2,
            spaceAfter=1,
        ),
        "skills_line": ParagraphStyle(
            "SkillsLine",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=7.55,
            leading=8.7,
            textColor=colors.HexColor("#333333"),
            spaceAfter=1,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.05,
            leading=9.35,
            leftIndent=8,
            firstLineIndent=-8,
            spaceAfter=1.1,
        ),
    }

    story: list = [
        paragraph("<b>Carl Welch</b>", styles["name"]),
        paragraph(
            "carlwelchdesign@gmail.com | 1-805-403-4819 | linkedin.com/in/carlwelch | github.com/carlwelchdesign",
            styles["contact"],
        ),
    ]

    story.extend(section("Summary", styles))
    story.append(
        paragraph(
            esc(
                "Senior Software Engineer with 20+ years of experience building enterprise web applications, developer platforms, mobile apps, analytics tools, media systems, campaign platforms, and internal workflow automation. Strong background in React, TypeScript, Node.js, API integrations, frontend architecture, test automation, component systems, and customer-facing product workflows. Experienced leading engineers, partnering with product, backend, design, and QA teams, and delivering scalable systems across identity, SaaS, sales engagement, mobility, analytics, media, advertising, and defense training domains."
            ),
            styles["body"],
        )
    )

    story.extend(section("Core Skills", styles))
    story.append(
        paragraph(
            esc(
                "React, TypeScript, JavaScript, Node.js, API Design, REST APIs, Backend-for-Frontend, Material UI, Storybook, Jest, Playwright, React Native, Redux, Backbone, Angular, PHP, MySQL, PostgreSQL, Docker, Kubernetes, Redis, Elasticsearch, Google Maps API, Stripe, Twilio, Firebase, WebSockets, AWS, Three.js, Canvas, Adobe Flash, Video Platforms, Analytics, CMS, Accessibility, Frontend Architecture, Test Automation, Developer Experience"
            ),
            styles["skills"],
        )
    )

    story.extend(section("Professional Experience", styles))
    story.extend(
        role(
            "Yubico - Senior Software Engineer",
            "Jul 2022 - Mar 2026",
            "React, TypeScript, Node.js, AWS, Material UI, Storybook, Jest, Playwright, API Integrations",
            [
                "Built enterprise admin console features supporting YubiKey management, provisioning flows, inventory/shipping workflows, and device lifecycle management.",
                "Designed notification workflows for alerts, shipment updates, provisioning status, admin announcements, errors, email, and in-app notifications.",
                "Partnered with backend and product teams on API contracts, frontend architecture, rollout planning, and enterprise workflow design.",
                "Led Storybook adoption and shared component library work, improving reuse, local development speed, and frontend consistency.",
                "Increased test automation by 50% using Jest and Playwright while reducing QA time, regressions, support issues, and release risk.",
                "Mentored engineers, reviewed PRs, defined frontend standards, coordinated with design, QA, and backend teams, and contributed to release planning.",
            ],
            styles,
        )
    )
    story.extend(
        role(
            "Revenue.io - Senior Software Engineer",
            "Mar 2020 - Jul 2022",
            "React, TypeScript, Node.js, Backend-for-Frontend, Backbone, Docker, Jest, Storybook",
            [
                "Built analytics dashboards, call/communication workflows, sales engagement tools, reporting views, admin tools, and customer-facing SaaS interfaces.",
                "Integrated Salesforce, HubSpot, Outreach, Salesloft, Twilio, telephony APIs, email/calendar workflows, and internal APIs.",
                "Migrated legacy Backbone screens to React and TypeScript while introducing shared components and modern frontend patterns.",
                "Improved sales team productivity by reducing friction across CRM, telephony, reporting, and communication workflows.",
                "Supported faster page loads, stronger test coverage, fewer bugs, fewer support issues, and broader sales team adoption.",
            ],
            styles,
        )
    )

    story.append(PageBreak())
    story.extend(section("Professional Experience Continued", styles))
    story.extend(
        role(
            "Bosch - Lead Frontend Developer",
            "Jul 2018 - Mar 2020",
            "React Native, TypeScript, Java, Xcode, Google Maps API, Stripe, Redis, Firebase, WebSockets, Twilio",
            [
                "Led frontend/mobile development for a B2B ride-sharing app supporting Bosch employees, corporate commuters, and internal mobility programs.",
                "Built scheduling, routing/maps, payments, messaging, real-time driver/rider updates, localization, and release workflows.",
                "Coordinated with backend, product, design, QA, and international stakeholders across US, Mexico, and Germany launches.",
                "Managed Apple App Store and Google Play release planning while improving release speed and operational reliability.",
                "Mentored engineers, defined mobile/frontend architecture, and supported real-time communication and payment workflows.",
            ],
            styles,
        )
    )
    story.extend(
        role(
            "Bridg - Senior Frontend Engineer",
            "Dec 2017 - Aug 2018",
            "React, TypeScript, Jest, Kubernetes, Elasticsearch Schemas, API Design",
            [
                "Built analytics dashboards, segmentation workflows, reporting tools, search/filtering experiences, and data visualization features.",
                "Helped restaurant/retail brands understand customers, segment audiences, measure campaigns, analyze transactions, and improve loyalty decisions.",
                "Defined frontend architecture, component patterns, API contracts, and testing standards while mentoring engineers and reviewing PRs.",
                "Improved dashboard responsiveness, query/search usability, maintainability, and engineering delivery quality.",
            ],
            styles,
        )
    )
    story.extend(
        role(
            "Grindr - Senior Web Developer / Manager",
            "Apr 2016 - Aug 2017",
            "React, JavaScript, Sass, Go, Analytics, CMS, Computer Vision, Mobile Campaigns",
            [
                "Built internal marketing tools, high-traffic web properties, campaign platforms, ad tooling, backend/admin tools, and analytics workflows.",
                "Developed an in-app ad campaign package tool that automated creative generation, resizing/cropping, metadata packaging, targeting rules, QA checks, exports, mobile handoff, and analytics integration, improving workflow efficiency by 2400%.",
                "Built a content website and CMS with editorial publishing, ad placement, analytics, campaign pages, and backend/admin tooling, contributing to a 300% revenue increase.",
                "Built Gaymoji keyboard experiences including keyboard UI, emoji/sticker asset systems, mobile integrations, campaign landing pages, app store support, analytics, and admin tools.",
                "Created an augmented-reality/computer-vision campaign experience where users triggered animated emoji from physical Grindr advertisements.",
                "Managed developers, reviewed code, planned releases, and coordinated with marketing, product, design, mobile teams, vendors, and stakeholders.",
            ],
            styles,
        )
    )
    story.extend(
        role(
            "SapientNitro - Manager, Interactive Development",
            "2015 - 2016",
            "JavaScript, React, Angular, Backbone, SCSS, Node.js, PHP, MySQL, Social Media APIs",
            [
                "Led frontend architecture and onsite forward-deployed development for major retail and entertainment brands.",
                "Managed developers, estimated work, reviewed code, coordinated with design, product, and account teams, and owned delivery.",
                "Launched high-traffic campaigns and sites, reduced delivery time, improved maintainability, and built reusable components across clients.",
            ],
            styles,
        )
    )

    story.append(PageBreak())
    story.extend(section("Earlier Experience", styles))
    story.extend(
        role(
            "Nezzoh Studios - Technical Director",
            "Dec 2013 - Dec 2014",
            "JavaScript, PHP, MySQL, Chromecast, Roku APIs, Kaltura, Analytics, Video Accessibility",
            [
                "Led video platform development, Chromecast streaming work for Fox Studios, Kaltura player plugins, analytics integrations, and ad plugins.",
                "Built Omniture, DoubleClick, AddThis, FreeWheel, share, endcard, and UI player plugin work across Flash/HTML5 video players.",
                "Supported accessibility, closed captioning, and video developer needs for major media networks including Disney, Fox, and CBS.",
                "Set technical direction, scoped work, reviewed code, coordinated vendors, mentored developers, and worked directly with client stakeholders.",
            ],
            styles,
        )
    )
    story.extend(
        role(
            "Trailer Park Studios - Lead Developer",
            "Sep 2012 - Sep 2013",
            "JavaScript, jQuery, CSS, Flash, Three.js, Canvas, PHP, MySQL, Backbone, Node.js",
            [
                "Led interactive entertainment marketing work for major studios, including Warner Bros. campaign work for The Conjuring.",
                "Built admin tools, interactive frontend experiences, short-film contest moderation tooling, and Apple iBooks widgets.",
                "Oversaw five junior developers to recover a project that was near collapse.",
            ],
            styles,
        )
    )
    story.extend(
        role(
            "BPG Advertising - Interactive Art Director / Front End Developer, Contract",
            "May 2012 - Jul 2012",
            "JavaScript, jQuery, CSS, Flash, Three.js, Canvas, PHP, MySQL, Backbone, Node.js",
            [
                "Built entertainment marketing sites, interactive campaigns, microsites, Flash ads, landing pages, CMS/admin tools, and social integrations.",
            ],
            styles,
        )
    )
    story.extend(
        role(
            "Petrol - Interactive Art Director / Full Stack Developer",
            "Sep 2011 - Feb 2012",
            "HTML, CSS, JavaScript, jQuery, PHP, MySQL, Localization, Three.js, Canvas, Flash",
            [
                "Built movie/game marketing sites, microsites, interactive campaigns, Flash ads, social integrations, analytics, and frontend/backend systems.",
                "Supported Sony PlayStation, UFC, Metal Gear Solid, Dark Souls, and Dragon's Dogma campaign work.",
            ],
            styles,
        )
    )
    story.extend(
        role(
            "TASER International / AXON - Front End Developer",
            "Apr 2009 - Oct 2011",
            "JavaScript, HTML5, CSS, jQuery, Flash, Google Maps API, PHP, MySQL, Video Player Development, Encryption",
            [
                "Built AXON officer dashboard features for body-camera video review, GPS/map playback, evidence annotation, case preparation, secure packaging, and video tooling.",
                "Supported high-volume video files, synchronized GPS/video playback, chain-of-custody workflows, secure evidence transfer, and prosecutor/court exports.",
            ],
            styles,
        )
    )
    story.extend(
        role(
            "General Dynamics Land Systems - Manager / Lead Developer",
            "2001 - 2004",
            "VR/AR Hardware, Visual Basic, C++, Macromedia Director 3D, CAD, AutoCAD",
            [
                "Led VR/AR training and maintenance simulation programs for Stryker combat vehicle scenarios.",
                "Built interactive 3D instruction, vehicle simulations, defense training demos, and hardware/software prototypes with academic and defense stakeholders.",
            ],
            styles,
        )
    )

    story.extend(section("Projects", styles))
    story.append(
        paragraph(
            "<b>Job Search OS</b> - "
            + esc(
                "Local-first AI-powered job search operating system with specialized agents, RAG over approved career evidence, job scoring, resume/cover letter generation, application QA, recruiter outreach, outcome learning, and controlled browser workflows. Skills: Next.js, TypeScript, React, Prisma, PostgreSQL, pgvector, Redis, Docker, OpenAI structured outputs, RAG, MCP, LangGraph, LangChain, Playwright, Server-Sent Events, Material UI, Vitest"
            ),
            styles["body"],
        )
    )

    story.extend(section("Education", styles))
    story.append(paragraph("Virginia Commonwealth University - Bachelor of Fine Arts", styles["body"]))

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=LETTER,
        rightMargin=39,
        leftMargin=39,
        topMargin=34,
        bottomMargin=34,
        title="Carl Welch Master Resume - 3 Page",
        author="Carl Welch",
        subject="Senior Software Engineer Resume",
    )
    doc.build(story)


if __name__ == "__main__":
    build()
