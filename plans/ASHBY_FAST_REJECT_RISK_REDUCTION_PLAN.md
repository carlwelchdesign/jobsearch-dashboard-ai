# Ashby Fast-Reject Risk Reduction

## Summary
Add an Ashby-specific pre-submit checklist that reduces instant rejection risk from knockout application questions and improves criteria visibility for Ashby AI-assisted review. Use a "maximize pass-through, stay truthful" posture: answer favorable interpretations when supported, but pause before any answer that could be false, unverifiable, or materially risky.

Ashby basis: Ashby auto-reject rules can run at application submission from application-question conditions, including global rules, while AI-assisted review evaluates resumes against recruiter-defined criteria and leaves decisions to reviewers.

## Key Changes
- Add an `ashbyRisk` section to the assistant package for Ashby applications:
  - ATS provider, risk level, known knockout categories, missing answer categories, and recommended user checks.
  - Categories: work authorization, sponsorship, location/remote eligibility, relocation, salary/compensation, required years, must-have tech, onsite/hybrid availability, custom "experience with X" questions.
- Extend the Playwright assistant field inventory to classify likely knockout fields before manual submit:
  - Auto-fill clear favorable truthful answers for configured/known-safe categories.
  - Pause and surface a clear blocker for ambiguous or unsupported knockout answers.
  - Keep Ashby auto-submit disabled; the assistant still requires manual final submit.
- Add an Ashby pre-submit checklist to Apply Sprint and the application detail page:
  - "Ready", "Needs review", or "High risk" status.
  - Show detected risky unanswered fields, filled favorable fields, and suggested answer memory matches.
  - Add a "Generate answer" action for unresolved custom questions using the existing application-question helper.
- Improve resume/material QA for Ashby jobs:
  - Add an "Ashby criteria visibility" check that verifies the top third of the resume explicitly names role-relevant must-haves from the job description.
  - Suggested edits should prioritize clear criteria evidence, not keyword stuffing.
  - Feed warnings into packet approval so weak criteria visibility is visible before launch.
- Expand answer memory for knockout-style questions:
  - Save approved answers with category tags such as `work_authorization`, `sponsorship`, `location`, `salary`, `required_experience`, and `must_have_skill`.
  - Allow auto-use only for low-risk categories with high confidence.
  - Salary, relocation, and custom experience answers remain review-first unless explicitly approved for auto-use.

## Interfaces
- Extend assistant package JSON with:
  - `ashbyRisk: { enabled, riskLevel, checklist, detectedFields, recommendedActions }`
- Add a shared library module for Ashby risk classification, used by:
  - assistant package generation,
  - Playwright field inventory,
  - packet/material QA,
  - UI checklist rendering.
- Do not change existing settings APIs, application submit policy, or auto-submit eligibility contracts.
- Preserve the existing safety rule: Ashby applications are never auto-submitted.

## Test Plan
- Unit tests for Ashby risk classification:
  - work authorization yes/no variants,
  - sponsorship variants,
  - location/remote eligibility,
  - salary and relocation review blocking,
  - must-have skill/custom experience prompts.
- Assistant package tests:
  - Ashby package includes `ashbyRisk`.
  - Non-Ashby package omits or disables it.
  - Ashby still returns `autoSubmitAllowed: false`.
- Playwright assistant tests or Python compile plus focused fixtures:
  - detected Ashby knockout fields are classified.
  - safe known answers fill.
  - ambiguous fields create review blockers instead of guessing.
- UI tests/manual checks:
  - Apply Sprint shows Ashby checklist.
  - Application detail shows packet/material QA warnings.
  - Generate-answer flow still saves selected answers.
- Verification:
  - `npx tsc --noEmit --pretty false`
  - targeted Vitest tests for applications, assistant package, and application-question helper
  - `python3 -m py_compile scripts/playwright_assistant.py`
  - `npx react-doctor@latest --verbose --diff`

## Assumptions
- User preference is **Maximize Pass-Through** within truthful boundaries.
- First implementation priority is the **Pre-Submit Checklist**.
- The system should not fabricate eligibility, skills, years, location availability, salary flexibility, or work authorization.
- Ashby fast rejects are treated primarily as form-answer risk; Ashby AI-assisted review is treated as resume criteria visibility risk.
