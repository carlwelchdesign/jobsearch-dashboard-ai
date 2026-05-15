# Application Automation

## Apply Sprint

Apply Sprint is the controlled application automation surface. It helps the user do less physical work while preserving judgment and safety gates.

It can:

- select ready applications
- show packet readiness
- prepare assistant package data
- launch the local browser assistant
- surface blocker state
- show logs and automation status

## Application Packets

An application packet is generated per approved job and may include:

- tailored resume
- cover letter
- application answers
- recruiter message
- hiring manager message
- company brief
- project links
- evidence references
- QA warnings

Packets can be:

- draft
- needs review
- approved
- submitted
- archived

## Application Answer Memory

The system stores reusable answers to application questions with reuse policy and sensitivity level.

Answer memory supports:

- finding likely reusable answers
- selecting an answer for a packet
- tracking usage
- avoiding automatic use of sensitive answers unless policy allows it

Sensitive answer-memory encryption was deferred unless sensitive reuse is expanded later.

## Local Browser Assistant

The assistant is a local Playwright workflow.

Install:

```bash
npm run assistant:install
```

Run manually:

```bash
npm run assistant:apply -- <application-id>
```

The app can also launch it from the UI.

The assistant can:

- open the employer application URL
- fill safe known fields
- upload generated resume and cover letter files when matching controls are visible
- write selected application answers to a local text file
- detect blockers
- update automation run records
- ask the user for help through Needs Me

The assistant must not:

- bypass CAPTCHA
- use stealth settings
- rotate proxies
- invent answers
- fill sensitive demographic answers automatically

## Auto-Submit Policy

The system supports global and company-level auto-submit configuration.

Company policy modes:

- inherit
- allow
- block

Safety gates still apply. Company-level overrides exist because some companies or ATS flows may be trusted, while others should always stop for manual review.

## Blockers

When automation cannot safely continue, it creates an agent user request.

Examples:

- unknown application question
- login or OAuth wall
- CAPTCHA
- unclear field
- missing approved packet
- unapproved sensitive answer
- policy forbids submit

The user resolves blockers in Needs Me. If the answer can be reused later, it can be saved to answer memory.
