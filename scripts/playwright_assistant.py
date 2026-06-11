#!/usr/bin/env python3
"""Local application form assistant.

This script opens a prepared job application, fills safe known fields, uploads the
generated resume/cover letter when matching file inputs are visible, and then
stops unless the local app explicitly allows auto-submit for this application.
It never bypasses CAPTCHA or uses stealth browser modes.
"""

from __future__ import annotations

import argparse
import json
import platform
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except AttributeError:
    pass


SAFE_TEXT_FIELDS = {
    "first_name": ["first name", "given name", "firstname", "first_name", "fname"],
    "last_name": ["last name", "surname", "lastname", "last_name", "family name", "lname"],
    "full_name": ["full name", "name", "legal name"],
    "email": ["email", "e-mail"],
    "phone": ["phone", "mobile", "telephone"],
    "location": ["location", "city", "address", "current location"],
    "linkedin_url": ["linkedin", "linked in"],
    "github_url": ["github"],
    "portfolio_url": ["portfolio", "website", "personal site", "homepage"],
}

COVER_LETTER_TEXT_PATTERNS = re.compile(
    r"cover[\s_-]*letter|coverletter|letter of interest|motivation letter|"
    r"tell us why|why (do )?you want to join|why (are )?you interested|"
    r"why this (role|position|company|team)|why.*join.*team|"
    r"what interests you about (this role|our company|our team)",
    re.I,
)

FIELD_SELECTORS = {
    "first_name": [
        "input[autocomplete='given-name']",
        "input[name*='first' i]",
        "input[id*='first' i]",
        "input[data-qa*='first' i]",
    ],
    "last_name": [
        "input[autocomplete='family-name']",
        "input[name*='last' i]",
        "input[id*='last' i]",
        "input[data-qa*='last' i]",
    ],
    "full_name": [
        "input[autocomplete='name']",
        "input[name='name' i]",
        "input[id='name' i]",
        "input[name*='full_name' i]",
        "input[id*='full_name' i]",
        "input[name*='fullName' i]",
        "input[id*='fullName' i]",
    ],
    "email": [
        "input[type='email']",
        "input[autocomplete='email']",
        "input[name*='email' i]",
        "input[id*='email' i]",
    ],
    "phone": [
        "input[type='tel']",
        "input[autocomplete='tel']",
        "input[name*='phone' i]",
        "input[id*='phone' i]",
        "input[name*='mobile' i]",
        "input[id*='mobile' i]",
    ],
    "location": [
        "input[autocomplete='address-level2']",
        "input[name*='location' i]",
        "input[id*='location' i]",
        "input[name*='city' i]",
        "input[id*='city' i]",
    ],
    "linkedin_url": [
        "input[name*='linkedin' i]",
        "input[id*='linkedin' i]",
        "input[placeholder*='linkedin' i]",
    ],
    "github_url": [
        "input[name*='github' i]",
        "input[id*='github' i]",
        "input[placeholder*='github' i]",
    ],
    "portfolio_url": [
        "input[name*='portfolio' i]",
        "input[id*='portfolio' i]",
        "input[placeholder*='portfolio' i]",
        "input[name*='website' i]",
        "input[id*='website' i]",
        "input[name*='url' i]",
        "input[id*='url' i]",
    ],
}

SENSITIVE_PATTERNS = re.compile(
    r"gender|race|ethnic|veteran|disab|orientation|pronoun|religion|age|birth|ssn|social security",
    re.I,
)
DEMOGRAPHIC_FIELD_PATTERNS = {
    "race": re.compile(r"race|ethnic", re.I),
    "gender": re.compile(r"gender", re.I),
    "veteranStatus": re.compile(r"veteran|military service|armed forces", re.I),
    "disability": re.compile(r"disab|ability status", re.I),
}
WORK_AUTHORIZATION_ELIGIBILITY_PATTERN = re.compile(
    r"eligible to work|authorized to work|work authorization|legally authorized|"
    r"right to work|permission to work",
    re.I,
)
WORK_AUTHORIZATION_SPONSORSHIP_PATTERN = re.compile(
    r"visa sponsorship|require sponsorship|requires sponsorship|future sponsorship|"
    r"need sponsorship|immigration sponsorship|employment sponsorship",
    re.I,
)
PHONE_COUNTRY_PATTERN = re.compile(
    r"phone.*country|country.*phone|country.*code|dial(?:ing)? code|calling code|"
    r"phone.*prefix|mobile.*country",
    re.I,
)
CANDIDATE_COUNTRY_PATTERN = re.compile(r"^country\b|country\*|\bcountry\b", re.I)
PHONE_COUNTRY_ANSWER = "United States +1"
COUNTRY_ANSWER = "United States"
SUBMIT_PATTERNS = re.compile(r"submit|send application|apply now|complete application|finish", re.I)
CAPTCHA_PATTERNS = re.compile(r"captcha|recaptcha|hcaptcha|verify you are human", re.I)
ASHBY_SPAM_BLOCK_PATTERNS = re.compile(
    r"we couldn.?t submit your application|possible spam|flagged as possible spam|"
    r"google.?s recaptcha technology|to protect against spam and bots|submit your application again",
    re.I,
)
ASHBY_SALARY_PATTERN = re.compile(r"salary|compensation|pay|expected comp|desired comp|base range|rate", re.I)
ASHBY_RELOCATION_PATTERN = re.compile(r"relocat|move to|willing to move", re.I)
ASHBY_ONSITE_PATTERN = re.compile(r"onsite|on-site|hybrid|in office|office days|commute", re.I)
ASHBY_LOCATION_PATTERN = re.compile(r"location|where are you based|country|state|city|timezone|time zone", re.I)
ASHBY_EXPERIENCE_PATTERN = re.compile(r"years of experience|yrs of experience|how many years|minimum experience", re.I)
ASHBY_SKILL_PATTERN = re.compile(r"react|typescript|javascript|graphql|node|aws|python|design system|accessibility|security|saas", re.I)
ASHBY_CUSTOM_PATTERN = re.compile(r"do you have|have you|experience with|describe your experience|tell us about|required qualification", re.I)
SUBMIT_CONFIRMATION_PATTERNS = re.compile(
    r"application (has been )?(submitted|received)|"
    r"thank you for (applying|your application)|"
    r"we (have )?received your application|"
    r"your application (is )?(complete|in review)|"
    r"we.ll be in touch|"
    r"we will be in touch|"
    r"confirmation (number|id)|"
    r"application complete",
    re.I,
)
VALIDATION_ERROR_PATTERNS = re.compile(
    r"required field|field is required|please (complete|fill|enter|select)|"
    r"missing required|must be completed|invalid email|invalid phone|"
    r"there (was|were) .*error|fix .*error|cannot submit",
    re.I,
)
CLOSED_JOB_PATTERNS = re.compile(
    r"not found|404 error|posting.*closed|posting.*removed|job.*closed|job.*removed|couldn.t find anything here",
    re.I,
)
GOOGLE_BLOCK_PATTERNS = re.compile(
    r"this browser or app may not be secure|couldn.t sign you in|try using a different browser",
    re.I,
)
MANUAL_ONLY_HOSTS = {"remoteok.com", "remoteok.io"}


def main() -> int:
    args = parse_args()
    assistant_event(args.application_id, "workflow_started", "Playwright assistant runner started.")
    try:
        package = fetch_json(f"{args.app_url.rstrip('/')}/api/applications/{args.application_id}/assistant-package")
    except Exception as exc:
        print(f"Unable to load assistant package: {exc}", file=sys.stderr)
        return 1

    workdir = Path(args.output_dir).expanduser().resolve() / args.application_id
    workdir.mkdir(parents=True, exist_ok=True)
    base_filename = build_material_filename(package)
    resume_pdf = download_file(package["materials"]["resumePdfUrl"], workdir / f"{base_filename} - CV.pdf")
    cover_letter_pdf = download_file(package["materials"]["coverLetterPdfUrl"], workdir / f"{base_filename} - Cover Letter.pdf")
    cover_letter_text = workdir / f"{base_filename} - Cover Letter.txt"
    cover_letter_text.write_text(package["materials"]["coverLetterBody"], encoding="utf-8")
    selected_answers = package.get("materials", {}).get("selectedApplicationAnswers", [])
    selected_answers_text = write_selected_answers_file(selected_answers, workdir / f"{base_filename} - Application Answers.txt")
    (workdir / "assistant-package.json").write_text(json.dumps(package, indent=2), encoding="utf-8")

    print("Prepared local materials:")
    print(f"- Resume PDF: {resume_pdf}")
    print(f"- Cover letter PDF: {cover_letter_pdf}")
    print(f"- Cover letter text: {cover_letter_text}")
    print(f"- Job: {package['job']['company']} - {package['job']['title']}")
    if selected_answers_text:
        print(f"- Selected application answers: {selected_answers_text}")
    print()
    auto_submit_allowed = bool(package.get("safety", {}).get("autoSubmitAllowed"))
    if auto_submit_allowed:
        print("Safety checkpoint: auto-submit is enabled by local app policy for this run.")
    else:
        print("Safety checkpoint: this assistant will stop before submit.")

    if is_manual_only_url(package["job"]["applicationUrl"]):
        print("This job board requires a normal browser or exposes an intermediary listing before applying.")
        print("Opening the application URL in your default browser and revealing prepared materials.")
        open_manual_handoff(package["job"]["applicationUrl"], workdir)
        return 0

    try:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(
            "Playwright is not installed. Run: python3 -m pip install -r requirements-local.txt && python3 -m playwright install chromium",
            file=sys.stderr,
        )
        return 1

    with sync_playwright() as playwright:
        browser_or_context, page = open_browser(playwright, args)
        page.goto(package["job"]["applicationUrl"], wait_until="domcontentloaded", timeout=args.timeout)
        assistant_event(args.application_id, "page_opened", "Application page opened.", {"url": page.url})
        bring_browser_to_front(page)
        page.wait_for_timeout(2500)
        open_embedded_application_form(page)
        page.wait_for_timeout(1000)
        body_text = page.inner_text("body", timeout=5000)

        if CLOSED_JOB_PATTERNS.search(body_text) or "404" in page.title():
            assistant_event(args.application_id, "blocker_found", "Application page appears closed or unavailable.", {"blockerType": "closed_job", "url": page.url})
            print("This application page appears to be closed, removed, or unavailable. No form can be filled.")
            browser_or_context.close()
            return 0

        if "accounts.google." in page.url or GOOGLE_BLOCK_PATTERNS.search(body_text):
            assistant_event(args.application_id, "blocker_found", "Google sign-in blocked the automation browser.", {"blockerType": "login_block", "url": page.url})
            print("Google sign-in blocked the automation browser. Handing off to normal Chrome.")
            browser_or_context.close()
            open_manual_handoff(package["job"]["applicationUrl"], workdir)
            print("Complete login/application manually in the normal Chrome window.")
            return 0

        if is_ashby_application(page.url, package) and ASHBY_SPAM_BLOCK_PATTERNS.search(body_text):
            emit_ashby_spam_block(args, page)
            browser_or_context.close()
            open_manual_handoff(package["job"]["applicationUrl"], workdir)
            return 0

        if CAPTCHA_PATTERNS.search(body_text):
            assistant_event(args.application_id, "blocker_found", "Assistant paused.", {"blockerType": "manual_handoff", "url": page.url})
            print("Assistant paused.")
            browser_or_context.close()
            open_manual_handoff(package["job"]["applicationUrl"], workdir)
            return 0

        form_contexts = application_contexts(page)
        print(f"Scanning {len(form_contexts)} page/frame context(s) for application fields.")
        inventory_before = detect_fields_in_contexts(form_contexts)
        assistant_event(args.application_id, "fields_detected", "Application fields detected before filling.", {"fieldCount": len(inventory_before), "url": page.url})
        print_field_inventory("Detected fields before filling", inventory_before)
        report_ashby_knockout_risks(args, page, package, inventory_before, "before filling")

        if package.get("workflow", {}).get("fieldByFieldCommands"):
            filled = sum(fill_safe_fields(context, package) for context in form_contexts)
            learned_filled = sum(fill_learned_form_rules(context, package) for context in form_contexts)
            memory_filled = sum(fill_learned_field_memories(context, package) for context in form_contexts)
            demographic_filled = sum(
                fill_demographic_fields(context, package["candidate"].get("demographicAnswers", {}))
                for context in form_contexts
            )
            uploads = sum(upload_materials(context, resume_pdf, cover_letter_pdf) for context in form_contexts)
            inventory_after_legacy_fill = detect_fields_in_contexts(form_contexts)
            print_field_inventory("Detected fields after package, learned memory, and upload fill", inventory_after_legacy_fill)
            report_ashby_knockout_risks(args, page, package, inventory_after_legacy_fill, "after filling")
            print()
            print(f"Filled {filled} safe text fields.")
            print(f"Filled {learned_filled} learned recurring field(s).")
            print(f"Filled {memory_filled} saved field memory value(s).")
            print(f"Filled {demographic_filled} configured demographic field(s).")
            print(f"Uploaded {uploads} material file(s).")
            assistant_event(args.application_id, "fill_summary", "Assistant completed package and learned-memory fill pass.", {
                "safeFieldsFilled": filled,
                "learnedFieldsFilled": learned_filled,
                "memoryFieldsFilled": memory_filled,
                "demographicFieldsFilled": demographic_filled,
                "uploads": uploads,
            })
            field_command_loop(
                args,
                page,
                form_contexts,
                package,
                resume_pdf,
                cover_letter_pdf,
                inventory_after_legacy_fill,
            )
            if not auto_submit_allowed:
                for context in form_contexts:
                    protect_submit_buttons(context)
            learning_baseline = snapshot_fields_in_contexts(form_contexts)
            print("Review every field in the browser. Submit manually only if everything is correct.")
            print("The assistant will watch for a submission confirmation and mark this application applied when it appears.")
            assistant_event(args.application_id, "ready_for_manual_submit", "Assistant is waiting for manual review and submit.", {"url": page.url})
            mark_applied_state = {
                "application_id": args.application_id,
                "app_url": args.app_url,
                "marked": False,
                "learning_baseline": learning_baseline,
                "reported_learning_keys": set(),
                "package": package,
            }
            install_manual_submit_watchers(browser_or_context, mark_applied_state)
            keep_open(
                args,
                browser_or_context,
                package["job"]["applicationUrl"],
                workdir,
                mark_applied_state=mark_applied_state,
            )
            return 0

        filled = sum(fill_safe_fields(context, package) for context in form_contexts)
        learned_filled = sum(fill_learned_form_rules(context, package) for context in form_contexts)
        memory_filled = sum(fill_learned_field_memories(context, package) for context in form_contexts)
        demographic_filled = sum(
            fill_demographic_fields(context, package["candidate"].get("demographicAnswers", {}))
            for context in form_contexts
        )
        uploads = sum(upload_materials(context, resume_pdf, cover_letter_pdf) for context in form_contexts)
        if not auto_submit_allowed:
            for context in form_contexts:
                protect_submit_buttons(context)
        inventory_after = detect_fields_in_contexts(form_contexts)
        print_field_inventory("Detected fields after filling", inventory_after)
        report_ashby_knockout_risks(args, page, package, inventory_after, "after filling")
        learning_baseline = snapshot_fields_in_contexts(form_contexts)

        print()
        print(f"Filled {filled} safe text fields.")
        print(f"Filled {learned_filled} learned recurring field(s).")
        print(f"Filled {memory_filled} saved field memory value(s).")
        print(f"Filled {demographic_filled} configured demographic field(s).")
        print(f"Uploaded {uploads} material file(s).")
        assistant_event(args.application_id, "fill_summary", "Assistant completed safe fill pass.", {
            "safeFieldsFilled": filled,
            "learnedFieldsFilled": learned_filled,
            "memoryFieldsFilled": memory_filled,
            "demographicFieldsFilled": demographic_filled,
            "uploads": uploads,
        })
        if filled == 0 and uploads == 0:
            print("No fillable application fields or matching upload controls were found on this page.")
            print("This is often a job listing page, login page, or intermediary board rather than the final application form.")
        application_marked_applied = False
        if auto_submit_allowed and is_ashby_application(page.url, package):
            auto_submit_allowed = False
            print("Ashby application detected. Auto-submit disabled; use normal Chrome assisted fill and submit manually.")
        if auto_submit_allowed:
            submitted = attempt_auto_submit(page, form_contexts, inventory_after, selected_answers_text)
            if submitted:
                print("Auto-submit confirmed after safety checks passed.")
                capture_submit_confirmation(page, workdir)
                application_marked_applied = mark_application_applied(args.app_url, args.application_id, "auto-submit confirmation")
            else:
                print("Auto-submit skipped because a safety check did not pass. Review every field and submit manually only if correct.")
        else:
            print("Review every field in the browser. Submit manually only if everything is correct.")
            print("The assistant will watch for a submission confirmation and mark this application applied when it appears.")
            assistant_event(args.application_id, "ready_for_manual_submit", "Assistant is waiting for manual review and submit.", {"url": page.url})
        print("Sensitive demographic, salary, and custom questions were intentionally left untouched unless explicitly configured.")
        if selected_answers_text:
            print(f"Use selected custom-answer drafts from: {selected_answers_text}")
        mark_applied_state = {
            "application_id": args.application_id,
            "app_url": args.app_url,
            "marked": application_marked_applied,
            "learning_baseline": learning_baseline,
            "reported_learning_keys": set(),
            "package": package,
        }
        install_manual_submit_watchers(browser_or_context, mark_applied_state)
        keep_open(
            args,
            browser_or_context,
            package["job"]["applicationUrl"],
            workdir,
            mark_applied_state=mark_applied_state,
        )

    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Local Playwright application form assistant.")
    parser.add_argument("application_id", help="Application id from the Job Search OS tracker.")
    parser.add_argument("--app-url", default="http://localhost:3000", help="Local Job Search OS URL.")
    parser.add_argument("--output-dir", default=".assistant-downloads", help="Where generated materials are stored.")
    parser.add_argument("--headless", action="store_true", help="Run browser headlessly. Not recommended for review.")
    parser.add_argument("--timeout", type=int, default=45000, help="Navigation timeout in milliseconds.")
    parser.add_argument("--close-after", type=int, default=0, help="Seconds to keep browser open. 0 waits for Enter.")
    parser.add_argument(
        "--browser-channel",
        default="chrome",
        help="Browser channel for Playwright. Use chrome for normal local login flows, or chromium for the bundled browser.",
    )
    parser.add_argument(
        "--user-data-dir",
        default=".assistant-browser-profile",
        help="Persistent local browser profile directory used by the assistant.",
    )
    return parser.parse_args()


def assistant_event(application_id: str, event_type: str, message: str, payload: dict[str, Any] | None = None) -> None:
    print(
        "ASSISTANT_EVENT "
        + json.dumps(
            {
                "applicationId": application_id,
                "type": event_type,
                "message": message,
                "payload": payload or {},
                "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
            separators=(",", ":"),
        )
    )


def open_browser(playwright: Any, args: argparse.Namespace) -> tuple[Any, Any]:
    channel = None if args.browser_channel in ("", "chromium", "default") else args.browser_channel

    if args.user_data_dir:
        profile_dir = Path(args.user_data_dir).expanduser().resolve()
        profile_dir.mkdir(parents=True, exist_ok=True)
        try:
            context = playwright.chromium.launch_persistent_context(
                str(profile_dir),
                channel=channel,
                headless=args.headless,
            )
        except Exception as exc:
            if "SingletonLock" not in str(exc) and "ProcessSingleton" not in str(exc):
                raise
            fallback_dir = profile_dir.parent / f"{profile_dir.name}-{int(time.time())}"
            fallback_dir.mkdir(parents=True, exist_ok=True)
            print(f"Browser profile was locked. Retrying with {fallback_dir}.")
            assistant_event(args.application_id, "browser_profile_locked", "Browser profile was locked; retrying with a temporary assistant profile.", {
                "profileDir": str(profile_dir),
                "fallbackDir": str(fallback_dir),
            })
            context = playwright.chromium.launch_persistent_context(
                str(fallback_dir),
                channel=channel,
                headless=args.headless,
            )
        page = context.pages[0] if context.pages else context.new_page()
        return context, page

    browser = playwright.chromium.launch(channel=channel, headless=args.headless)
    context = browser.new_context()
    return browser, context.new_page()


def bring_browser_to_front(page: Any) -> None:
    try:
        page.bring_to_front()
    except Exception:
        pass
    if platform.system() == "Darwin":
        subprocess.run(["open", "-a", "Google Chrome"], check=False)


def fetch_json(url: str) -> dict[str, Any]:
    with urllib.request.urlopen(url) as response:
        return json.loads(response.read().decode("utf-8"))


def post_json(url: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    body = json.dumps(payload or {}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


def post_workflow_event(state: dict[str, Any] | None, event_type: str, message: str, payload: dict[str, Any] | None = None) -> bool:
    if not state:
        return False
    app_url = str(state.get("app_url") or "").rstrip("/")
    application_id = str(state.get("application_id") or "")
    if not app_url or not application_id:
        return False
    try:
        post_json(
            f"{app_url}/api/applications/{application_id}/assistant-workflow/events",
            {
                "type": event_type,
                "message": message,
                **(payload or {}),
            },
        )
        return True
    except Exception as exc:
        print(f"Unable to post assistant workflow event {event_type}: {exc}", file=sys.stderr)
        return False


def field_command_loop(
    args: argparse.Namespace,
    page: Any,
    contexts: list[Any],
    package: dict[str, Any],
    resume_pdf: Path,
    cover_letter_pdf: Path,
    inventory: list[dict[str, str]],
) -> None:
    workflow = package.get("workflow", {}) if isinstance(package.get("workflow"), dict) else {}
    event_url = workflow.get("eventUrl") or f"{args.app_url.rstrip('/')}/api/applications/{args.application_id}/assistant-workflow/events"
    command_url = workflow.get("commandUrl") or f"{args.app_url.rstrip('/')}/api/applications/{args.application_id}/assistant-workflow/command"
    result_url = workflow.get("commandResultUrl") or f"{args.app_url.rstrip('/')}/api/applications/{args.application_id}/assistant-workflow/command-result"
    post_json(str(event_url), {
        "type": "field_inventory",
        "message": f"Detected {len(inventory)} application field(s).",
        "url": page.url,
        "fields": [workflow_field(field) for field in inventory],
    })
    assistant_event(args.application_id, "field_inventory", "Field inventory sent to workflow controller.", {"fieldCount": len(inventory)})

    handled_commands: set[str] = set()
    learning_state = {
        "application_id": args.application_id,
        "app_url": args.app_url,
        "marked": False,
        "learning_baseline": snapshot_fields_in_contexts(contexts),
        "reported_learning_keys": set(),
        "package": package,
    }
    for _ in range(160):
        maybe_report_field_learning(page.context, learning_state)
        try:
            payload = fetch_json(str(command_url))
        except Exception as exc:
            print(f"Unable to poll assistant workflow command: {exc}", file=sys.stderr)
            time.sleep(2)
            continue

        command_payload = payload.get("command") if isinstance(payload, dict) else None
        if not isinstance(command_payload, dict):
            time.sleep(1)
            continue

        command_id = str(command_payload.get("id") or "")
        if not command_id or command_id in handled_commands:
            time.sleep(1)
            continue

        command_type = str(command_payload.get("type") or "")
        if command_type == "stop_for_submit":
            print(f"Workflow stopped for manual submit: {command_payload.get('reason') or 'review required'}")
            assistant_event(args.application_id, "ready_for_manual_submit", "Workflow stopped for manual submit.", {"commandId": command_id})
            handled_commands.add(command_id)
            break

        if command_type == "ask_user":
            print(f"Workflow needs user input: {command_payload.get('reason') or 'unknown field'}")
            assistant_event(args.application_id, "needs_user", "Workflow paused for user input.", {"commandId": command_id})
            handled_commands.add(command_id)
            time.sleep(3)
            continue

        if command_type == "observe":
            print(f"Workflow is learning from manual input: {command_payload.get('reason') or 'complete the highlighted field manually'}")
            assistant_event(args.application_id, "learning_mode", "Workflow is observing manual input for field learning.", {"commandId": command_id})
            handled_commands.add(command_id)
            time.sleep(3)
            continue

        result = execute_workflow_command(contexts, command_payload, resume_pdf, cover_letter_pdf)
        handled_commands.add(command_id)
        try:
            post_json(str(result_url), {
                "commandId": command_id,
                "result": result["result"],
                "message": result["message"],
                "valuePreview": result.get("valuePreview", ""),
            })
        except Exception as exc:
            print(f"Unable to report assistant workflow command result: {exc}", file=sys.stderr)
            break


def workflow_field(field: dict[str, str]) -> dict[str, Any]:
    label = str(field.get("label") or "(unlabeled field)")
    selector = str(field.get("selector") or "")
    input_type = str(field.get("type") or field.get("inputType") or "")
    context = str(field.get("context") or "")
    return {
        "fieldId": "field_" + canonical_field_key("_".join(part for part in [context, selector, input_type, label] if part)),
        "selector": selector,
        "label": label,
        "inputType": input_type,
        "required": bool(re.search(r"\*|required", label, re.I)),
        "category": str(field.get("category") or "custom"),
        "status": str(field.get("status") or ""),
        "context": context,
    }


def execute_workflow_command(contexts: list[Any], command_payload: dict[str, Any], resume_pdf: Path, cover_letter_pdf: Path) -> dict[str, str]:
    command_type = str(command_payload.get("type") or "")
    selector = str(command_payload.get("selector") or "")
    field_id = str(command_payload.get("fieldId") or "")
    if command_type == "skip":
        return {"result": "skipped", "message": f"Skipped field {field_id} by workflow policy."}

    element = find_element_by_selector(contexts, selector)
    if element is None:
        return {"result": "failed", "message": f"Unable to locate field for command {command_payload.get('id') or ''}."}

    try:
        if command_type == "fill":
            value = str(command_payload.get("value") or "")
            fill_command_element(element, value)
            mark_assistant_filled(element)
            return {
                "result": "success",
                "message": "Filled field from workflow command.",
                "valuePreview": value[:180],
            }
        if command_type == "upload":
            material = str(command_payload.get("material") or "")
            upload_path = cover_letter_pdf if material == "cover_letter" else resume_pdf
            set_upload_file(element, upload_path)
            mark_assistant_filled(element)
            return {
                "result": "success",
                "message": f"Uploaded {material or 'material'} from workflow command.",
                "valuePreview": upload_path.name,
            }
    except Exception as exc:
        return {"result": "failed", "message": f"Workflow command failed: {exc}"}

    return {"result": "failed", "message": f"Unsupported workflow command type: {command_type}"}


def find_element_by_selector(contexts: list[Any], selector: str) -> Any | None:
    if not selector:
        return None
    for context in contexts:
        try:
            locator = context.locator(selector).first
            if locator.count() and locator.is_visible(timeout=500):
                return locator
        except Exception:
            continue
    return None


def fill_command_element(element: Any, value: str) -> None:
    tag = str(element.evaluate("node => node.tagName") or "").upper()
    input_type = str(element.get_attribute("type") or "").lower()
    if tag == "SELECT":
        descriptor = field_descriptor(element)
        option_value = matching_option_value(element, value, descriptor)
        if option_value:
            element.select_option(value=option_value, timeout=1500)
            return
        try:
            element.select_option(label=value, timeout=1500)
        except Exception:
            element.select_option(value=value, timeout=1500)
        return
    if input_type in {"checkbox", "radio"}:
        descriptor = field_descriptor(element)
        if value.lower() in {"yes", "true", "checked", "1"} or answer_matches_descriptor(value, descriptor):
            element.check(timeout=1500)
        return
    element.fill(value, timeout=2500)


def mark_assistant_filled(element: Any) -> None:
    try:
        element.evaluate("node => { node.dataset.jobSearchOsFilled = 'true'; }")
    except Exception:
        pass


def download_file(url: str, path: Path) -> Path:
    with urllib.request.urlopen(url) as response:
        path.write_bytes(response.read())
    return path


def write_selected_answers_file(selected_answers: list[dict[str, Any]], path: Path) -> Path | None:
    if not selected_answers:
        return None
    sections: list[str] = []
    for index, item in enumerate(selected_answers, start=1):
        question = str(item.get("question") or "").strip()
        answer = str(item.get("answer") or "").strip()
        title = str(item.get("title") or f"Answer {index}").strip()
        cautions = [str(caution).strip() for caution in item.get("cautions", []) if str(caution).strip()]
        section = [f"{index}. {title}"]
        if question:
            section.extend(["", f"Question: {question}"])
        if answer:
            section.extend(["", answer])
        if cautions:
            section.extend(["", "Cautions:", *[f"- {caution}" for caution in cautions]])
        sections.append("\n".join(section))
    path.write_text("\n\n---\n\n".join(sections), encoding="utf-8")
    return path


def build_material_filename(package: dict[str, Any]) -> str:
    candidate = package.get("candidate", {})
    job = package.get("job", {})
    full_name = candidate.get("fullName") or "Candidate"
    company = job.get("company") or "Company"
    title = job.get("title") or "Role"
    return sanitize_filename(f"{full_name} - {company} - {title}")


def sanitize_filename(value: str) -> str:
    cleaned = re.sub(r"[\\/:*?\"<>|]+", "-", value)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    return cleaned[:140] or "Application Materials"


def is_manual_only_url(url: str) -> bool:
    hostname = urlparse(url).hostname or ""
    normalized = hostname.lower().removeprefix("www.")
    return normalized in MANUAL_ONLY_HOSTS


def fill_safe_fields(page: Any, package: dict[str, Any]) -> int:
    candidate = package.get("candidate", {})
    values = {
        "first_name": candidate.get("firstName", ""),
        "last_name": candidate.get("lastName", ""),
        "full_name": candidate.get("fullName", ""),
        "email": candidate.get("email", ""),
        "phone": candidate.get("phone", ""),
        "location": candidate.get("location", ""),
        "linkedin_url": candidate.get("linkedinUrl", ""),
        "github_url": candidate.get("githubUrl", ""),
        "portfolio_url": candidate.get("portfolioUrl", ""),
        "cover_letter": package.get("materials", {}).get("coverLetterBody", ""),
    }
    has_github_field = page_has_github_field(page)
    filled = fill_by_known_selectors(page, values, has_github_field)
    elements = page.locator("input:not([type=hidden]):not([type=file]), textarea")
    count = elements.count()

    for index in range(count):
        element = elements.nth(index)
        try:
            if not element.is_visible() or not element.is_enabled():
                continue
            field_text = field_descriptor(element)
            if SENSITIVE_PATTERNS.search(field_text):
                continue
            if element.input_value(timeout=500):
                continue
            match_key = "cover_letter" if cover_letter_text_field(field_text, element) else match_safe_key(field_text)
            if not match_key:
                continue
            value = value_for_safe_text_field(match_key, field_text, values, has_github_field)
            if not value:
                continue
            fill_element(element, value)
            if match_key == "cover_letter":
                print(f"Filled cover letter text field: {field_text[:120] or 'unlabeled field'}")
            filled += 1
        except Exception:
            continue

    return filled


def page_has_github_field(page: Any) -> bool:
    elements = page.locator("input:not([type=hidden]):not([type=file]), textarea")
    for index in range(elements.count()):
        element = elements.nth(index)
        try:
            if not element.is_visible(timeout=200):
                continue
            if "github" in field_descriptor(element):
                return True
        except Exception:
            continue
    return False


def value_for_safe_text_field(match_key: str, field_text: str, values: dict[str, str], has_github_field: bool) -> str:
    if match_key == "portfolio_url" and website_only_field(field_text) and not has_github_field:
        return values.get("github_url", "") or values.get("portfolio_url", "")
    return values.get(match_key, "")


def cover_letter_text_field(field_text: str, element: Any) -> bool:
    if not COVER_LETTER_TEXT_PATTERNS.search(field_text):
        return False
    try:
        tag = str(element.evaluate("node => node.tagName") or "").upper()
        input_type = str(element.get_attribute("type") or tag).lower()
    except Exception:
        return True
    return tag == "TEXTAREA" or input_type in {"text", "textarea", "search"} or input_type == "input"


def upload_materials(page: Any, resume_pdf: Path, cover_letter_pdf: Path) -> int:
    uploaded = 0
    inputs = page.locator("input[type=file]")
    elements = inputs.element_handles()
    count = len(elements)
    resume_uploaded = False
    cover_uploaded = False
    upload_targets: list[tuple[Any, str, str]] = []

    for element in elements:
        try:
            descriptor = file_field_descriptor(element)
            material = material_for_upload_field(descriptor, count, resume_uploaded, cover_uploaded)
            if material:
                upload_targets.append((element, descriptor, material))
            if material == "resume":
                resume_uploaded = True
            elif material == "cover_letter":
                cover_uploaded = True
        except Exception:
            continue

    # Some ATS widgets remove or replace the resume input after upload. Upload cover
    # letters first so a live DOM mutation cannot skip the second file input.
    upload_targets.sort(key=lambda target: 0 if target[2] == "cover_letter" else 1)

    for element, descriptor, material in upload_targets:
        try:
            if material == "cover_letter":
                set_upload_file(element, cover_letter_pdf)
                uploaded += 1
                print(f"Uploaded cover letter PDF to: {descriptor[:120] or 'unlabeled upload field'}")
            elif material == "resume":
                set_upload_file(element, resume_pdf)
                uploaded += 1
                print(f"Uploaded resume PDF to: {descriptor[:120] or 'unlabeled upload field'}")
        except Exception as exc:
            print(f"Could not upload {material.replace('_', ' ')} to: {descriptor[:120] or 'unlabeled upload field'} ({exc})")
    return uploaded


def set_upload_file(element: Any, path: Path) -> None:
    element.set_input_files(str(path), timeout=3000)
    mark_filled(element)
    if not upload_visible_after_set(element, path.name):
        raise RuntimeError("browser did not report a selected file after upload")


def upload_visible_after_set(element: Any, filename: str) -> bool:
    normalized_filename = filename.lower()
    for _ in range(20):
        try:
            uploaded_name = element.evaluate("node => node.files && node.files[0] ? node.files[0].name : ''")
            if uploaded_name and uploaded_name.lower() == normalized_filename:
                return True
        except Exception:
            pass
        try:
            surrounding_text = element.evaluate(
                """node => {
                  const containers = [];
                  let parent = node.parentElement;
                  for (let index = 0; parent && index < 8; index += 1, parent = parent.parentElement) {
                    if (parent.tagName === 'FORM') break;
                    const text = (parent.innerText || '').trim();
                    if (text) containers.push(text);
                  }
                  return containers.join(' ');
                }"""
            )
            if normalized_filename in str(surrounding_text or "").lower():
                return True
        except Exception:
            pass
        time.sleep(0.1)
    return False


def material_for_upload_field(descriptor: str, count: int, resume_uploaded: bool, cover_uploaded: bool) -> str | None:
    cover_match = re.search(r"cover[\s_-]*letter|coverletter|letter of interest|motivation letter", descriptor, re.I)
    resume_match = re.search(r"resume|résumé|cv|curriculum vitae", descriptor, re.I)
    if cover_match and resume_match:
        return "cover_letter" if cover_match.start() < resume_match.start() else "resume"
    if cover_match:
        return "cover_letter"
    if resume_match:
        return "resume"
    if re.search(r"additional document|supporting document|attachment|upload", descriptor, re.I):
        if resume_uploaded and not cover_uploaded:
            return "cover_letter"
        if not resume_uploaded:
            return "resume"
    if count == 1 and not resume_uploaded:
        return "resume"
    return None


def file_field_descriptor(element: Any) -> str:
    attrs = element.evaluate(
        """node => {
          const label = node.labels && node.labels.length ? Array.from(node.labels).map(label => label.innerText).join(' ') : '';
          const id = node.getAttribute('id') || '';
          const name = node.getAttribute('name') || '';
          const aria = node.getAttribute('aria-label') || '';
          const accept = node.getAttribute('accept') || '';
          const describedBy = node.getAttribute('aria-describedby') || '';
          const describedText = describedBy
            ? describedBy.split(/\\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' ')
            : '';
          const labelledContainer = node.closest('[aria-labelledby]');
          const labelledBy = labelledContainer
            ? (labelledContainer.getAttribute('aria-labelledby') || '')
                .split(/\\s+/)
                .map((id) => document.getElementById(id)?.innerText || '')
                .join(' ')
            : '';
          const fieldWrapper = node.closest('.field-wrapper, .file-upload, [role="group"]');
          const fieldWrapperText = fieldWrapper ? (fieldWrapper.innerText || '').slice(0, 320) : '';
          const containers = [];
          let parent = node.parentElement;
          for (let index = 0; parent && index < 7; index += 1, parent = parent.parentElement) {
            if (parent.tagName === 'FORM') break;
            const text = (parent.innerText || '').trim();
            if (text && text.length < 240) containers.push(text);
          }
          return [label, name, id, aria, accept, describedText, labelledBy, fieldWrapperText, ...containers]
            .filter(Boolean)
            .join(' ');
        }"""
    )
    return re.sub(r"\s+", " ", attrs).strip().lower()


def detect_fields(page: Any) -> list[dict[str, str]]:
    fields: list[dict[str, str]] = []
    elements = page.locator("input, textarea, select")
    for index in range(elements.count()):
        element = elements.nth(index)
        try:
            input_type = (element.get_attribute("type") or element.evaluate("node => node.tagName")).lower()
            if input_type == "hidden":
                continue
            descriptor = field_descriptor(element)
            category = field_category(descriptor)
            status = "empty"
            if input_type == "file":
                status = "upload-control"
            elif input_type in {"radio", "checkbox"}:
                status = "checked" if element.is_checked(timeout=300) else "unchecked"
            else:
                value = element.input_value(timeout=300) if element.evaluate("node => node.tagName !== 'SELECT'") else element.evaluate("node => node.options[node.selectedIndex]?.text || ''")
                status = "filled" if value else "empty"
            fields.append({
                "type": input_type,
                "category": category,
                "label": descriptor[:140] or "(unlabeled field)",
                "status": status,
                "selector": stable_field_selector(element),
            })
        except Exception:
            continue
    return fields


def detect_fields_in_contexts(contexts: list[Any]) -> list[dict[str, str]]:
    fields: list[dict[str, str]] = []
    for context in contexts:
        context_label = context_name(context)
        for field in detect_fields(context):
            if context_label:
                field = {**field, "context": context_label}
            fields.append(field)
    return fields


def snapshot_fields(page: Any) -> list[dict[str, str]]:
    fields: list[dict[str, str]] = []
    elements = page.locator("input, textarea, select")
    for index in range(elements.count()):
        element = elements.nth(index)
        try:
            input_type = (element.get_attribute("type") or element.evaluate("node => node.tagName")).lower()
            if input_type in {"hidden", "password", "file"}:
                continue
            descriptor = field_descriptor(element)
            if SENSITIVE_PATTERNS.search(descriptor) or blocked_learning_descriptor(descriptor):
                continue
            value = observed_field_value(element, input_type)
            fields.append({
                "fieldKey": canonical_field_key(stable_field_selector(element) or descriptor),
                "category": field_category(descriptor),
                "label": descriptor[:300] or "(unlabeled field)",
                "inputType": input_type,
                "selector": stable_field_selector(element),
                "answer": value,
                "assistantFilled": "true" if assistant_filled(element) else "false",
            })
        except Exception:
            continue
    return fields


def snapshot_fields_in_contexts(contexts: list[Any]) -> dict[str, dict[str, str]]:
    snapshot: dict[str, dict[str, str]] = {}
    for context in contexts:
        for field in snapshot_fields(context):
            key = observed_field_key(field)
            if key:
                snapshot[key] = field
    return snapshot


def observed_field_value(element: Any, input_type: str) -> str:
    try:
        tag = str(element.evaluate("node => node.tagName") or "").upper()
        if input_type in {"radio", "checkbox"}:
            return "checked" if element.is_checked(timeout=300) else ""
        if tag == "SELECT":
            return str(element.evaluate("node => node.options[node.selectedIndex]?.text || node.value || ''") or "").strip()
        return str(element.input_value(timeout=300) or "").strip()
    except Exception:
        return ""


def assistant_filled(element: Any) -> bool:
    try:
        return bool(element.evaluate("node => node.dataset.jobSearchOsFilled === 'true'"))
    except Exception:
        return False


def observed_field_key(field: dict[str, str]) -> str:
    return f"{field.get('category','unknown')}:{field.get('selector') or field.get('fieldKey') or field.get('label')}"


def print_field_inventory(title: str, fields: list[dict[str, str]]) -> None:
    print()
    print(f"{title}:")
    if not fields:
        print("- No input, textarea, select, or upload fields detected.")
        return
    for field in fields:
        context = f" | {field['context']}" if field.get("context") else ""
        selector = f" | selector: {field['selector']}" if field.get("selector") else ""
        print(f"- {field['category']}: {field['status']} | {field['type']}{context}{selector} | {field['label']}")


def report_ashby_knockout_risks(args: argparse.Namespace, page: Any, package: dict[str, Any], fields: list[dict[str, str]], phase: str) -> list[dict[str, str]]:
    if not is_ashby_application(page.url, package):
        return []
    risks: list[dict[str, str]] = []
    seen: set[str] = set()
    for field in fields:
        label = str(field.get("label") or "")
        classified = classify_ashby_knockout_field(label)
        if not classified:
            continue
        key = f"{classified['category']}:{normalize_for_match(label)}"
        if key in seen:
            continue
        seen.add(key)
        risk = {
            **classified,
            "label": label[:180],
            "status": str(field.get("status") or "unknown"),
            "phase": phase,
        }
        risks.append(risk)

    if not risks:
        return []

    high_risk = [risk for risk in risks if risk["riskLevel"] == "high_risk" and risk["status"] != "filled"]
    review_risk = [risk for risk in risks if risk["riskLevel"] != "ready" and risk["status"] != "filled"]
    print()
    print("Ashby pre-submit knockout review:")
    for risk in risks:
        suggestion = f" | suggested: {risk['suggestedAnswer']}" if risk.get("suggestedAnswer") else ""
        print(f"- {risk['riskLevel']} | {risk['category']} | {risk['status']}{suggestion} | {risk['label']}")
    if review_risk:
        print("Review these Ashby fields before clicking submit. Do not leave risky required fields blank.")

    assistant_event(args.application_id, "ashby_knockout_review", "Ashby knockout-risk fields detected.", {
        "url": page.url,
        "phase": phase,
        "riskCount": len(risks),
        "highRiskCount": len(high_risk),
        "reviewCount": len(review_risk),
        "risks": risks[:12],
    })
    if high_risk:
        assistant_event(args.application_id, "blocker_found", "Ashby high-risk knockout field needs manual review before submit.", {
            "blockerType": "ashby_knockout_review",
            "url": page.url,
            "risks": high_risk[:8],
        })
    return risks


def classify_ashby_knockout_field(label: str) -> dict[str, str] | None:
    if WORK_AUTHORIZATION_ELIGIBILITY_PATTERN.search(label):
        return {"category": "work_authorization", "riskLevel": "ready", "suggestedAnswer": "Yes", "autoFillSafe": "true"}
    if WORK_AUTHORIZATION_SPONSORSHIP_PATTERN.search(label):
        return {"category": "sponsorship", "riskLevel": "ready", "suggestedAnswer": "No", "autoFillSafe": "true"}
    if ASHBY_SALARY_PATTERN.search(label):
        return {"category": "salary", "riskLevel": "high_risk", "autoFillSafe": "false"}
    if ASHBY_RELOCATION_PATTERN.search(label):
        return {"category": "relocation", "riskLevel": "high_risk", "autoFillSafe": "false"}
    if ASHBY_ONSITE_PATTERN.search(label):
        return {"category": "onsite_hybrid", "riskLevel": "needs_review", "autoFillSafe": "false"}
    if ASHBY_EXPERIENCE_PATTERN.search(label):
        return {"category": "required_experience", "riskLevel": "needs_review", "autoFillSafe": "false"}
    if ASHBY_SKILL_PATTERN.search(label):
        return {"category": "must_have_skill", "riskLevel": "needs_review", "autoFillSafe": "false"}
    if ASHBY_LOCATION_PATTERN.search(label):
        return {"category": "location", "riskLevel": "needs_review", "autoFillSafe": "false"}
    if ASHBY_CUSTOM_PATTERN.search(label):
        return {"category": "custom", "riskLevel": "high_risk", "autoFillSafe": "false"}
    return None


def stable_field_selector(element: Any) -> str:
    try:
        return element.evaluate(
            """node => {
              const tag = node.tagName.toLowerCase();
              const cssEscape = value => {
                if (window.CSS && window.CSS.escape) return window.CSS.escape(value);
                return String(value).replace(/["\\\\]/g, '\\\\$&');
              };
              const id = node.getAttribute('id');
              if (id) return `${tag}#${cssEscape(id)}`;
              const name = node.getAttribute('name');
              if (name) return `${tag}[name="${cssEscape(name)}"]`;
              const aria = node.getAttribute('aria-label');
              if (aria) return `${tag}[aria-label="${cssEscape(aria)}"]`;
              return tag;
            }"""
        )
    except Exception:
        return ""


def field_category(descriptor: str) -> str:
    if "resume" in descriptor or "cv" in descriptor:
        return "resume"
    if "cover" in descriptor:
        return "cover_letter"
    for key, pattern in DEMOGRAPHIC_FIELD_PATTERNS.items():
        if pattern.search(descriptor):
            return key
    match_key = match_safe_key(descriptor)
    return match_key or ("sensitive_unfilled" if SENSITIVE_PATTERNS.search(descriptor) else "unknown")


def fill_demographic_fields(page: Any, answers: dict[str, str]) -> int:
    filled = 0
    if not isinstance(answers, dict):
        return 0
    for key, pattern in DEMOGRAPHIC_FIELD_PATTERNS.items():
        answer = str(answers.get(key) or "").strip()
        if not answer:
            continue
        filled += fill_matching_selects(page, pattern, answer)
        filled += fill_matching_radios(page, pattern, answer)
        filled += fill_matching_comboboxes(page, pattern, answer)
    return filled


def fill_matching_selects(page: Any, pattern: re.Pattern[str], answer: str) -> int:
    filled = 0
    selects = page.locator("select")
    for index in range(selects.count()):
        element = selects.nth(index)
        try:
            descriptor = field_descriptor(element)
            if not pattern.search(descriptor) or not element.is_visible() or not element.is_enabled():
                continue
            option_value = matching_option_value(element, answer, descriptor)
            if not option_value:
                print(f"Configured demographic answer did not match options for: {descriptor[:120]}")
                continue
            element.select_option(value=option_value, timeout=1500)
            mark_filled(element)
            filled += 1
        except Exception:
            continue
    return filled


def fill_matching_radios(page: Any, pattern: re.Pattern[str], answer: str) -> int:
    filled = 0
    radios = page.locator("input[type=radio], input[type=checkbox]")
    for index in range(radios.count()):
        element = radios.nth(index)
        try:
            descriptor = field_descriptor(element)
            if not pattern.search(descriptor) or not answer_matches_descriptor(answer, descriptor):
                continue
            if not element.is_enabled():
                continue
            element.check(timeout=1500)
            mark_filled(element)
            filled += 1
            break
        except Exception:
            continue
    return filled


def fill_learned_form_rules(page: Any, package: dict[str, Any]) -> int:
    filled = 0
    if package_targets_us_work_authorization(package):
        filled += fill_matching_selects(page, WORK_AUTHORIZATION_ELIGIBILITY_PATTERN, "yes")
        filled += fill_matching_radios(page, WORK_AUTHORIZATION_ELIGIBILITY_PATTERN, "yes")
        filled += fill_matching_comboboxes(page, WORK_AUTHORIZATION_ELIGIBILITY_PATTERN, "Yes")
    filled += fill_matching_selects(page, WORK_AUTHORIZATION_SPONSORSHIP_PATTERN, "no")
    filled += fill_matching_radios(page, WORK_AUTHORIZATION_SPONSORSHIP_PATTERN, "no")
    filled += fill_matching_comboboxes(page, WORK_AUTHORIZATION_SPONSORSHIP_PATTERN, "No")
    return filled


def fill_learned_field_memories(page: Any, package: dict[str, Any]) -> int:
    memories = package.get("learning", {}).get("fieldMemories", [])
    if not isinstance(memories, list):
        return 0
    filled = 0
    for memory in memories:
        if not isinstance(memory, dict) or not memory_safe_to_autofill(memory):
            continue
        answer = str(memory.get("answer") or "").strip()
        if not answer:
            continue
        if fill_memory_by_selector(page, memory, answer):
            filled += 1
            continue
        if fill_memory_by_label(page, memory, answer):
            filled += 1
    return filled


def memory_safe_to_autofill(memory: dict[str, Any]) -> bool:
    if str(memory.get("sensitivity") or "").upper() != "LOW":
        return False
    if str(memory.get("reusePolicy") or "") != "AUTO_USE":
        return False
    try:
        if int(memory.get("confidence") or 0) < 82:
            return False
    except Exception:
        return False
    descriptor = " ".join(str(memory.get(key) or "") for key in ["category", "label", "selector", "inputType"])
    if SENSITIVE_PATTERNS.search(descriptor) or blocked_learning_descriptor(descriptor):
        return False
    return True


def fill_memory_by_selector(page: Any, memory: dict[str, Any], answer: str) -> bool:
    selector = str(memory.get("selector") or "").strip()
    if not selector:
        return False
    try:
        element = page.locator(selector).first
        return fill_memory_element(element, answer, memory)
    except Exception:
        return False


def fill_memory_by_label(page: Any, memory: dict[str, Any], answer: str) -> bool:
    target_label = normalize_for_match(str(memory.get("label") or ""))
    target_category = normalize_for_match(str(memory.get("category") or ""))
    if not target_label and not target_category:
        return False
    elements = page.locator("input:not([type=hidden]):not([type=file]), textarea, select, [role=combobox]")
    for index in range(elements.count()):
        element = elements.nth(index)
        try:
            descriptor = field_descriptor(element)
            normalized = normalize_for_match(descriptor)
            if SENSITIVE_PATTERNS.search(descriptor) or blocked_learning_descriptor(descriptor):
                continue
            if target_label and field_label_similarity(target_label, normalized) < 0.72:
                if target_category and target_category not in normalized:
                    continue
            if fill_memory_element(element, answer, memory):
                return True
        except Exception:
            continue
    return False


def fill_memory_element(element: Any, answer: str, memory: dict[str, Any]) -> bool:
    try:
        if not element.is_visible(timeout=300) or not element.is_enabled():
            return False
        descriptor = field_descriptor(element)
        if SENSITIVE_PATTERNS.search(descriptor) or blocked_learning_descriptor(descriptor):
            return False
        if current_text_value(element) and "select" not in normalize_for_match(current_text_value(element)):
            return False
        tag = str(element.evaluate("node => node.tagName") or "").upper()
        input_type = str(element.get_attribute("type") or tag).lower()
        if input_type in {"hidden", "password", "file"}:
            return False
        if tag == "SELECT":
            option_value = matching_option_value(element, answer, descriptor)
            if not option_value:
                return False
            element.select_option(value=option_value, timeout=1500)
            mark_filled(element)
            print(f"Filled saved field memory: {str(memory.get('label') or descriptor)[:120]}")
            return True
        if input_type in {"radio", "checkbox"}:
            if not answer_matches_descriptor(answer, descriptor):
                return False
            element.check(timeout=1500)
            mark_filled(element)
            print(f"Selected saved field memory: {str(memory.get('label') or descriptor)[:120]}")
            return True
        if is_combobox_like(element, descriptor):
            if choose_combobox_option(element, answer):
                print(f"Selected saved field memory: {str(memory.get('label') or descriptor)[:120]}")
                return True
            return False
        fill_element(element, answer)
        print(f"Filled saved field memory: {str(memory.get('label') or descriptor)[:120]}")
        return True
    except Exception:
        return False


def fill_candidate_country_comboboxes(page: Any) -> int:
    filled = 0
    elements = page.locator("input:not([type=hidden]):not([type=file]), [role=combobox]")
    for index in range(elements.count()):
        element = elements.nth(index)
        try:
            if not element.is_visible(timeout=300) or not element.is_enabled():
                continue
            descriptor = field_descriptor(element)
            if not is_candidate_country_control(element, descriptor):
                continue
            if WORK_AUTHORIZATION_ELIGIBILITY_PATTERN.search(descriptor) or WORK_AUTHORIZATION_SPONSORSHIP_PATTERN.search(descriptor):
                continue
            if re.search(r"where the job is posted|location where the job|salary|race|gender|veteran|disab", descriptor, re.I):
                continue
            value = current_text_value(element)
            if value and "select" not in normalize_for_match(value):
                continue
            if choose_combobox_option(element, COUNTRY_ANSWER):
                print("Selected learned country answer: United States")
                filled += 1
        except Exception:
            continue
    return filled


def package_targets_us_work_authorization(package: dict[str, Any]) -> bool:
    job = package.get("job", {}) if isinstance(package.get("job", {}), dict) else {}
    if us_job(job):
        return True
    location = normalize_for_match(str(job.get("location") or ""))
    country = normalize_for_match(str(job.get("country") or ""))
    if country or any(token in location for token in ["canada", "ontario", "toronto", "british columbia", "quebec"]):
        return False
    remote_type = normalize_for_match(str(job.get("remoteType") or ""))
    candidate = package.get("candidate", {}) if isinstance(package.get("candidate", {}), dict) else {}
    candidate_location = str(candidate.get("location") or "")
    return "remote" in remote_type and candidate_location_is_us(candidate_location)


def us_job(job: dict[str, Any]) -> bool:
    country = normalize_for_match(str(job.get("country") or ""))
    location = normalize_for_match(str(job.get("location") or ""))
    haystack = f"{country} {location}"
    if country in {"us", "usa", "united states", "united states of america"}:
        return True
    return bool(re.search(r"\b(united states|united states of america|usa|u s|us)\b", haystack))


def candidate_location_is_us(location: str) -> bool:
    normalized = normalize_for_match(location)
    if re.search(r"\b(united states|united states of america|usa|u s|us)\b", normalized):
        return True
    return bool(re.search(
        r"\b(al|ak|az|ar|ca|co|ct|dc|de|fl|ga|hi|ia|id|il|in|ks|ky|la|ma|md|me|mi|mn|mo|ms|mt|nc|nd|ne|nh|nj|nm|nv|ny|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|va|vt|wa|wi|wv|wy)\b",
        normalized,
    ))


def fill_phone_country_selects(page: Any) -> int:
    filled = 0
    selects = page.locator("select")
    for index in range(selects.count()):
        element = selects.nth(index)
        try:
            descriptor = field_descriptor(element)
            if not element.is_visible() or not element.is_enabled():
                continue
            if not PHONE_COUNTRY_PATTERN.search(descriptor) and not select_has_phone_country_options(element):
                continue
            if select_current_text(element):
                current = normalize_for_match(select_current_text(element))
                if "united states" in current or current in {"us", "usa", "1"} or "+1" in current:
                    continue
            option_value = matching_option_value(element, PHONE_COUNTRY_ANSWER, descriptor)
            if not option_value:
                print(f"Learned phone country answer did not match options for: {descriptor[:120]}")
                continue
            element.select_option(value=option_value, timeout=1500)
            mark_filled(element)
            filled += 1
            print("Selected learned phone country answer: United States +1")
        except Exception:
            continue
    return filled


def fill_matching_comboboxes(page: Any, pattern: re.Pattern[str], answer: str) -> int:
    filled = 0
    elements = page.locator("input:not([type=hidden]):not([type=file]), [role=combobox]")
    for index in range(elements.count()):
        element = elements.nth(index)
        try:
            if not element.is_visible(timeout=300) or not element.is_enabled():
                continue
            descriptor = field_descriptor(element)
            if not pattern.search(descriptor):
                continue
            if not is_combobox_like(element, descriptor):
                continue
            if current_text_value(element):
                continue
            if choose_combobox_option(element, answer):
                print(f"Selected learned answer '{answer}' for: {descriptor[:120]}")
                filled += 1
        except Exception:
            continue
    filled += fill_greenhouse_paired_comboboxes(page, pattern, answer)
    return filled


def fill_phone_country_comboboxes(page: Any) -> int:
    filled = 0
    elements = page.locator("input:not([type=hidden]):not([type=file]), [role=combobox]")
    for index in range(elements.count()):
        element = elements.nth(index)
        try:
            if not element.is_visible(timeout=300) or not element.is_enabled():
                continue
            descriptor = field_descriptor(element)
            if not PHONE_COUNTRY_PATTERN.search(descriptor):
                continue
            if not is_combobox_like(element, descriptor):
                continue
            value = current_text_value(element)
            if value and ("united states" in normalize_for_match(value) or "+1" in value):
                continue
            if choose_combobox_option(element, PHONE_COUNTRY_ANSWER) or choose_combobox_option(element, "United States"):
                print("Selected learned phone country answer: United States +1")
                filled += 1
        except Exception:
            continue
    return filled


def fill_greenhouse_paired_comboboxes(page: Any, pattern: re.Pattern[str], answer: str) -> int:
    filled = 0
    labels = page.locator("input:not([type=hidden]):not([type=file])")
    for index in range(labels.count()):
        label = labels.nth(index)
        try:
            if not label.is_visible(timeout=300):
                continue
            descriptor = field_descriptor(label)
            if not pattern.search(descriptor):
                continue
            target = greenhouse_paired_combobox(label)
            if target is None:
                continue
            if current_text_value(target) and "select" not in normalize_for_match(current_text_value(target)):
                continue
            if choose_combobox_option(target, answer):
                print(f"Selected learned answer '{answer}' for Greenhouse question: {descriptor[:120]}")
                filled += 1
        except Exception:
            continue
    return filled


def greenhouse_paired_combobox(label: Any) -> Any | None:
    try:
        handles = label.evaluate_handle(
            """node => {
              const roots = [];
              let current = node.parentElement;
              for (let index = 0; current && index < 5; index += 1, current = current.parentElement) {
                roots.push(current);
              }
              for (const root of roots) {
                const candidates = Array.from(root.querySelectorAll('input:not([type="hidden"]):not([type="file"]), [role="combobox"]'));
                const nodeIndex = candidates.indexOf(node);
                const after = candidates.slice(Math.max(0, nodeIndex + 1));
                const target = after.find((candidate) => {
                  const role = candidate.getAttribute('role') || '';
                  const placeholder = candidate.getAttribute('placeholder') || '';
                  const aria = candidate.getAttribute('aria-autocomplete') || candidate.getAttribute('aria-haspopup') || '';
                  const value = candidate.value || candidate.innerText || '';
                  const text = `${role} ${placeholder} ${aria} ${value}`.toLowerCase();
                  return text.includes('combobox') || text.includes('listbox') || text.includes('select');
                });
                if (target) return target;
              }
              return null;
            }"""
        )
        element = handles.as_element()
        return element
    except Exception:
        return None


def is_candidate_country_control(element: Any, descriptor: str) -> bool:
    normalized = normalize_for_match(descriptor)
    if WORK_AUTHORIZATION_ELIGIBILITY_PATTERN.search(descriptor) or WORK_AUTHORIZATION_SPONSORSHIP_PATTERN.search(descriptor):
        return False
    if normalized in {"country", "country country"} or re.fullmatch(r"country country country|country select", normalized):
        return True
    try:
        element_id = str(element.get_attribute("id") or "").lower()
        name = str(element.get_attribute("name") or "").lower()
        placeholder = str(element.get_attribute("placeholder") or "").lower()
    except Exception:
        return False
    return (
        element_id == "country"
        or name == "country"
        or placeholder == "country"
        or placeholder == "select country"
    )


def is_combobox_like(element: Any, descriptor: str) -> bool:
    try:
        role = str(element.get_attribute("role") or "").lower()
        aria_autocomplete = str(element.get_attribute("aria-autocomplete") or "").lower()
        aria_haspopup = str(element.get_attribute("aria-haspopup") or "").lower()
        placeholder = str(element.get_attribute("placeholder") or "").lower()
        input_type = str(element.get_attribute("type") or "").lower()
    except Exception:
        return False
    normalized = normalize_for_match(descriptor)
    return (
        role == "combobox"
        or aria_autocomplete in {"list", "both"}
        or aria_haspopup == "listbox"
        or placeholder in {"select", "select...", "select country"}
        or input_type == "search" and "select" in normalized
    )


def choose_combobox_option(element: Any, answer: str) -> bool:
    try:
        element.click(timeout=1000)
        element.fill(answer, timeout=1500)
        element.press("Enter", timeout=1000)
        element.press("Tab", timeout=1000)
        mark_filled(element)
        return True
    except Exception:
        try:
            element.click(timeout=1000)
            element.type(answer, delay=20, timeout=1500)
            element.press("Enter", timeout=1000)
            mark_filled(element)
            return True
        except Exception:
            return False


def current_text_value(element: Any) -> str:
    try:
        tag = element.evaluate("node => node.tagName")
        if tag in {"INPUT", "TEXTAREA", "SELECT"}:
            return str(element.input_value(timeout=300) or "").strip()
    except Exception:
        pass
    try:
        return str(element.inner_text(timeout=300) or "").strip()
    except Exception:
        return ""


def phone_country_widget_nearby(element: Any) -> bool:
    try:
        descriptor = element.evaluate(
            """node => {
              const text = [];
              let current = node;
              for (let index = 0; current && index < 5; index += 1, current = current.parentElement) {
                text.push(current.innerText || "");
                text.push(current.getAttribute("class") || "");
                text.push(current.getAttribute("id") || "");
              }
              return text.join(" ");
            }"""
        )
    except Exception:
        return False
    normalized = normalize_for_match(str(descriptor))
    return (
        ("iti" in normalized or "intl" in normalized or "country" in normalized)
        and ("phone" in normalized or "tel" in normalized or "dial" in normalized)
    )


def select_has_phone_country_options(select: Any) -> bool:
    try:
        options_text = select.evaluate("node => Array.from(node.options).map(option => option.textContent || option.value || '').join(' ')")
    except Exception:
        return False
    normalized = normalize_for_match(str(options_text))
    return ("united states" in normalized or "usa" in normalized) and (" 1 " in f" {normalized} " or "+1" in str(options_text))


def select_current_text(select: Any) -> str:
    try:
        return str(select.evaluate("node => node.options[node.selectedIndex]?.text || ''") or "")
    except Exception:
        return ""


def matching_option_value(select: Any, answer: str, field_descriptor_text: str = "") -> str | None:
    options = select.evaluate(
        """node => Array.from(node.options).map(option => ({
          value: option.value,
          text: option.textContent || ''
        }))"""
    )
    for option in options:
        text = str(option.get("text", ""))
        value = str(option.get("value", ""))
        if answer_matches_descriptor(answer, f"{text} {value}", field_descriptor_text):
            return value
    return None


def answer_matches_descriptor(answer: str, descriptor: str, field_descriptor_text: str = "") -> bool:
    answer_tokens = normalize_for_match(answer)
    descriptor_tokens = normalize_for_match(descriptor)
    field_tokens = normalize_for_match(field_descriptor_text)
    if veteran_positive_answer(answer_tokens) and veteran_positive_option(descriptor_tokens, field_tokens):
        return True
    if veteran_negative_answer(answer_tokens) and veteran_negative_option(descriptor_tokens, field_tokens):
        return True
    if prefer_not_answer(answer_tokens) and prefer_not_option(descriptor_tokens):
        return True
    if answer_tokens and answer_tokens in descriptor_tokens:
        return True
    if answer_tokens == normalize_for_match(PHONE_COUNTRY_ANSWER):
        return (
            "united states" in descriptor_tokens
            or re.search(r"\b(us|usa)\b", descriptor_tokens) is not None
        ) and (" 1 " in f" {descriptor_tokens} " or "+1" in descriptor)
    aliases = {
        "prefer not to answer": ["decline", "do not wish", "prefer not", "not disclose", "i don't wish", "i do not wish"],
        "i do not wish to answer": ["decline", "do not wish", "prefer not", "not disclose"],
        "no": ["no", "not have", "do not have", "not a protected veteran", "not disabled"],
        "yes": ["yes", "have a disability", "protected veteran"],
    }
    for key, values in aliases.items():
        if key in answer_tokens and any(value in descriptor_tokens for value in values):
            return True
    return False


def veteran_positive_answer(answer_tokens: str) -> bool:
    return (
        "protected veteran" in answer_tokens
        and not veteran_negative_answer(answer_tokens)
        and not prefer_not_answer(answer_tokens)
    ) or "i identify as one or more" in answer_tokens


def veteran_negative_answer(answer_tokens: str) -> bool:
    return (
        "not a protected veteran" in answer_tokens
        or "i am not a protected veteran" in answer_tokens
        or "not protected veteran" in answer_tokens
    )


def prefer_not_answer(answer_tokens: str) -> bool:
    return any(token in answer_tokens for token in [
        "prefer not",
        "decline",
        "do not wish",
        "dont wish",
        "not disclose",
        "do not want to answer",
    ])


def veteran_positive_option(descriptor_tokens: str, field_tokens: str) -> bool:
    if "veteran" not in f"{descriptor_tokens} {field_tokens}":
        return False
    positive_phrases = [
        "i identify as one or more",
        "one or more of the classifications of protected veteran",
        "protected veteran",
        "active duty wartime",
        "armed forces service medal",
        "recently separated veteran",
        "disabled veteran",
    ]
    negative_phrases = ["not a protected veteran", "not protected veteran", "i am not", "do not identify"]
    return any(phrase in descriptor_tokens for phrase in positive_phrases) and not any(phrase in descriptor_tokens for phrase in negative_phrases)


def veteran_negative_option(descriptor_tokens: str, field_tokens: str) -> bool:
    if "veteran" not in f"{descriptor_tokens} {field_tokens}":
        return False
    return any(phrase in descriptor_tokens for phrase in [
        "not a protected veteran",
        "not protected veteran",
        "i am not a protected veteran",
        "i do not identify",
    ])


def prefer_not_option(descriptor_tokens: str) -> bool:
    return any(phrase in descriptor_tokens for phrase in [
        "prefer not",
        "decline",
        "do not wish",
        "not disclose",
        "do not want to answer",
    ])


def normalize_for_match(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def canonical_field_key(value: str) -> str:
    return re.sub(r"(^_+|_+$)", "", re.sub(r"[^a-z0-9]+", "_", value.lower()))[:100] or "field"


def blocked_learning_descriptor(value: str) -> bool:
    return re.search(
        r"password|captcha|token|secret|ssn|social security|payment|credit card|card number|"
        r"upload|resume|cover letter|salary|compensation|sponsor|sponsorship|visa|"
        r"race|ethnic|gender|veteran|disab|birth|age|citizenship|nationality|legal|attest|certify",
        value,
        re.I,
    ) is not None


def field_label_similarity(left: str, right: str) -> float:
    left_tokens = set(normalize_for_match(left).split())
    right_tokens = set(normalize_for_match(right).split())
    if not left_tokens or not right_tokens:
        return 0.0
    overlap = len(left_tokens & right_tokens)
    return overlap / max(len(left_tokens), 1)


def open_embedded_application_form(page: Any) -> None:
    if visible_application_field_count(page) > 0:
        return

    if activate_application_tab(page):
        wait_for_visible_application_fields(page)
        if visible_application_field_count(page) > 0:
            print("Application tab selected.")
            return

    for text in ["Apply for this job", "Apply now", "Apply", "Start application"]:
        try:
            button = page.get_by_role("button", name=re.compile(text, re.I)).first
            if button.count() and button.is_visible(timeout=500):
                button.click(timeout=1500)
                wait_for_visible_application_fields(page)
                return
        except Exception:
            pass
        try:
            link = page.get_by_role("link", name=re.compile(text, re.I)).first
            if link.count() and link.is_visible(timeout=500):
                link.click(timeout=1500)
                wait_for_visible_application_fields(page)
                return
        except Exception:
            pass

    if click_apply_link_by_selector(page):
        wait_for_visible_application_fields(page)
        return


def is_ashby_application(current_url: str, package: dict[str, Any]) -> bool:
    values = [
        current_url,
        str(package.get("job", {}).get("applicationUrl", "")),
        str(package.get("job", {}).get("applicationHost", "")),
    ]
    return any("ashbyhq.com" in value.lower() for value in values)


def emit_ashby_spam_block(args: argparse.Namespace, page: Any) -> None:
    message = "Ashby blocked submission as possible spam or reCAPTCHA risk."
    assistant_event(args.application_id, "blocker_found", message, {
        "blockerType": "ats_spam_block",
        "url": page.url,
        "atsProvider": "ashby",
        "safeRetry": "normal_chrome_extension_assist",
    })
    print("Ashby reported a possible-spam or reCAPTCHA submission block.")
    print("Stopping the Playwright-controlled flow. Retry in normal Chrome with the Job Search OS extension, then submit manually.")


def click_apply_link_by_selector(page: Any) -> bool:
    selectors = [
        "a#job-cta-alt",
        "a.apply-btn",
        ".listing-apply-cta__btn a",
        "a[href*='apply' i]",
        "a[href*='onboarding' i]",
    ]
    for selector in selectors:
        locator = page.locator(selector)
        for index in range(locator.count()):
            element = locator.nth(index)
            try:
                descriptor = field_descriptor(element)
                if not re.search(r"apply|application|onboarding", descriptor, re.I):
                    continue
                if not element.is_visible(timeout=500):
                    continue
                print(f"Clicking application link: {descriptor[:120]}")
                element.click(timeout=1500)
                return True
            except Exception:
                continue
    return False


def visible_application_field_count(page: Any) -> int:
    return sum(visible_application_field_count_in_context(context) for context in application_contexts(page))


def visible_application_field_count_in_context(context: Any) -> int:
    fields = context.locator("input:not([type=hidden]), textarea, select")
    visible = 0
    for index in range(fields.count()):
        try:
            if fields.nth(index).is_visible(timeout=200):
                visible += 1
        except Exception:
            continue
    return visible


def wait_for_visible_application_fields(page: Any, timeout_ms: int = 8000) -> None:
    deadline = time.time() + (timeout_ms / 1000)
    while time.time() < deadline:
        if visible_application_field_count(page) > 0:
            return
        page.wait_for_timeout(250)


def application_contexts(page: Any) -> list[Any]:
    contexts = [page]
    try:
        main_frame = page.main_frame
        for frame in page.frames:
            if frame == main_frame:
                continue
            try:
                frame.locator("body").count()
                contexts.append(frame)
            except Exception:
                continue
    except Exception:
        pass
    return contexts


def context_name(context: Any) -> str:
    try:
        if hasattr(context, "url") and context.url:
            parsed = urlparse(context.url)
            if parsed.netloc:
                return parsed.netloc
    except Exception:
        pass
    return ""


def activate_application_tab(page: Any) -> bool:
    for name in ["Application", "Apply", "Apply for this job", "Job application"]:
        try:
            tab = page.get_by_role("tab", name=re.compile(name, re.I)).first
            if tab.count() and tab.is_visible(timeout=500):
                already_selected = tab.get_attribute("aria-selected") == "true"
                if not already_selected:
                    tab.click(timeout=1500)
                return True
        except Exception:
            pass

    selectors = [
        "[role='tab'][aria-controls*='application' i]",
        "[role='tab'][id*='application' i]",
        "[role='tab'][class*='application' i]",
        "[role='tab'][class*='app' i]",
        "button[aria-controls*='application' i]",
        "button[id*='application' i]",
        "button[class*='job-app' i]",
        "button[class*='application' i]",
        "a[aria-controls*='application' i]",
        "a[href*='application' i]",
        "a[class*='job-app' i]",
        "a[class*='application' i]",
    ]
    for selector in selectors:
        locator = page.locator(selector)
        for index in range(locator.count()):
            element = locator.nth(index)
            try:
                descriptor = field_descriptor(element)
                if not re.search(r"application|apply|job app", descriptor, re.I):
                    continue
                if not element.is_visible(timeout=500) or not element.is_enabled():
                    continue
                if element.get_attribute("aria-selected") != "true":
                    element.click(timeout=1500)
                return True
            except Exception:
                continue

    clicked = page.evaluate(
        """() => {
          const candidates = Array.from(document.querySelectorAll('button, a, [role="tab"]'));
          const match = candidates.find((node) => {
            const text = [
              node.innerText || '',
              node.id || '',
              node.className || '',
              node.getAttribute('aria-controls') || '',
              node.getAttribute('aria-label') || ''
            ].join(' ').toLowerCase();
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && /application|apply|job-app/.test(text);
          });
          if (!match) return false;
          match.click();
          return true;
        }"""
    )
    return bool(clicked)


def fill_by_known_selectors(page: Any, values: dict[str, str], has_github_field: bool) -> int:
    filled = 0
    used = set()
    for key, selectors in FIELD_SELECTORS.items():
        value = values.get(key)
        if not value:
            continue
        field_filled = False
        for selector in selectors:
            locator = page.locator(selector)
            for index in range(locator.count()):
                element = locator.nth(index)
                try:
                    identity = element.evaluate("node => `${node.tagName}:${node.name || ''}:${node.id || ''}:${node.getAttribute('autocomplete') || ''}`")
                    if identity in used:
                        continue
                    descriptor = field_descriptor(element)
                    if SENSITIVE_PATTERNS.search(descriptor):
                        continue
                    if not element.is_visible() or not element.is_enabled():
                        continue
                    if element.input_value(timeout=500):
                        continue
                    fill_value = value_for_safe_text_field(key, descriptor, values, has_github_field)
                    if not fill_value:
                        continue
                    fill_element(element, fill_value)
                    used.add(identity)
                    filled += 1
                    field_filled = True
                    break
                except Exception:
                    continue
            if field_filled:
                break
    return filled


def fill_element(element: Any, value: str) -> None:
    element.fill(value, timeout=1500)
    mark_filled(element)


def mark_filled(element: Any) -> None:
    element.evaluate(
        """node => {
          node.dataset.jobSearchOsFilled = 'true';
          node.style.outline = '2px solid #17803d';
          node.style.outlineOffset = '2px';
        }"""
    )


def protect_submit_buttons(page: Any) -> None:
    page.evaluate(
        """(patternSource) => {
          const pattern = new RegExp(patternSource, 'i');
          const nodes = Array.from(document.querySelectorAll('button, input[type=submit], [role=button]'));
          for (const node of nodes) {
            const text = `${node.innerText || ''} ${node.value || ''} ${node.getAttribute('aria-label') || ''}`;
            if (pattern.test(text)) {
              node.dataset.jobSearchOsSubmitCheckpoint = 'true';
              node.style.outline = '3px solid #b42318';
              node.title = 'Manual submit checkpoint: review everything before clicking.';
            }
          }
        }""",
        SUBMIT_PATTERNS.pattern,
    )


def attempt_auto_submit(page: Any, contexts: list[Any], inventory: list[dict[str, str]], selected_answers_text: Path | None) -> bool:
    if selected_answers_text:
        print("Auto-submit skipped: selected custom answers were prepared for manual review.")
        return False
    risky_empty = [
        field for field in inventory
        if field.get("status") in {"empty", "unchecked"}
        and field.get("category") in {"sensitive_unfilled", "unknown"}
    ]
    if risky_empty:
        print(f"Auto-submit skipped: {len(risky_empty)} unknown or sensitive empty field(s) remain.")
        return False
    required_empty = sum(required_empty_field_count(context) for context in contexts)
    if required_empty:
        print(f"Auto-submit skipped: {required_empty} required empty field(s) remain.")
        return False
    if CAPTCHA_PATTERNS.search(page.inner_text("body", timeout=5000)):
        print("Auto-submit skipped: manual review is needed before continuing.")
        return False

    submit = find_submit_control(contexts)
    if submit is None:
        print("Auto-submit skipped: no visible submit control was found.")
        return False
    descriptor = field_descriptor(submit)
    print(f"Clicking submit control: {descriptor[:120] or 'unlabeled submit control'}")
    submit.click(timeout=3000)
    page.wait_for_timeout(2500)
    if submit_confirmation_detected(page):
        return True

    refreshed_contexts = application_contexts(page)
    if find_submit_control(refreshed_contexts) is not None:
        print("Auto-submit skipped: secondary confirmation or review step detected after the first submit click.")
        return False

    print("Auto-submit skipped: final submission confirmation was not detected after the submit click.")
    return False


def submit_confirmation_detected(page: Any) -> bool:
    try:
        body_text = page.inner_text("body", timeout=5000)
    except Exception:
        body_text = ""
    try:
        title = page.title(timeout=2000)
    except Exception:
        title = ""
    try:
        url = page.url
    except Exception:
        url = ""
    return bool(SUBMIT_CONFIRMATION_PATTERNS.search(f"{body_text}\n{title}\n{url}"))


def capture_submit_confirmation(page: Any, workdir: Path) -> None:
    timestamp = int(time.time())
    screenshot_path = workdir / f"submit-confirmation-{timestamp}.png"
    text_path = workdir / f"submit-confirmation-{timestamp}.txt"
    try:
        page.screenshot(path=str(screenshot_path), full_page=True, timeout=5000)
        print(f"Submit confirmation screenshot: {screenshot_path}")
    except Exception as exc:
        print(f"Submit confirmation screenshot failed: {exc}")

    try:
        body_text = page.inner_text("body", timeout=5000)
        normalized = re.sub(r"\s+", " ", body_text).strip()
        confirmation = normalized[:4000]
        text_path.write_text(confirmation, encoding="utf-8")
        print(f"Submit confirmation text: {text_path}")
        summary = summarize_confirmation_text(confirmation)
        if summary:
            print(f"Submit confirmation summary: {summary}")
    except Exception as exc:
        print(f"Submit confirmation text failed: {exc}")


def summarize_confirmation_text(text: str) -> str:
    lowered = text.lower()
    match = SUBMIT_CONFIRMATION_PATTERNS.search(lowered)
    if match:
        start = max(0, match.start() - 80)
        end = min(len(text), match.end() + 180)
        return text[start:end].strip()
    return text[:240].strip()


def required_empty_field_count(page: Any) -> int:
    count = 0
    fields = page.locator("input:not([type=hidden]), textarea, select")
    for index in range(fields.count()):
        element = fields.nth(index)
        try:
            if not element.is_visible(timeout=200) or not element.is_enabled():
                continue
            required = element.get_attribute("required") is not None or element.get_attribute("aria-required") == "true"
            if not required:
                continue
            input_type = (element.get_attribute("type") or element.evaluate("node => node.tagName")).lower()
            if input_type in {"radio", "checkbox"}:
                if not element.is_checked(timeout=200):
                    count += 1
            elif input_type == "file":
                uploaded_name = element.evaluate("node => node.files && node.files[0] ? node.files[0].name : ''")
                if not uploaded_name:
                    count += 1
            else:
                value = element.input_value(timeout=200) if element.evaluate("node => node.tagName !== 'SELECT'") else element.evaluate("node => node.options[node.selectedIndex]?.text || ''")
                if not value:
                    count += 1
        except Exception:
            continue
    return count


def find_submit_control(contexts: list[Any]) -> Any | None:
    selectors = [
        "button[type='submit']",
        "input[type='submit']",
        "button:has-text('Submit')",
        "button:has-text('Send application')",
        "button:has-text('Complete application')",
        "[role=button]:has-text('Submit')",
    ]
    for context in contexts:
        for selector in selectors:
            locator = context.locator(selector)
            for index in range(locator.count()):
                element = locator.nth(index)
                try:
                    descriptor = field_descriptor(element)
                    if not SUBMIT_PATTERNS.search(descriptor):
                        continue
                    if not element.is_visible(timeout=500) or not element.is_enabled():
                        continue
                    return element
                except Exception:
                    continue
    return None


def field_descriptor(element: Any) -> str:
    attrs = element.evaluate(
        """node => {
          const label = node.labels && node.labels.length ? Array.from(node.labels).map(label => label.innerText).join(' ') : '';
          const parent = node.closest('label, div, section, fieldset');
          return [
            label,
            node.getAttribute('name'),
            node.getAttribute('id'),
            node.getAttribute('aria-label'),
            node.getAttribute('placeholder'),
            parent ? parent.innerText.slice(0, 180) : ''
          ].filter(Boolean).join(' ').toLowerCase();
        }"""
    )
    return re.sub(r"\s+", " ", attrs).strip()


def match_safe_key(field_text: str) -> str | None:
    for key, patterns in SAFE_TEXT_FIELDS.items():
        if any(pattern in field_text for pattern in patterns):
            if key == "full_name" and ("first" in field_text or "last" in field_text):
                continue
            return key
    return None


def website_only_field(field_text: str) -> bool:
    return (
        re.search(r"\b(web\s*site|website|homepage)\b", field_text, re.I) is not None
        and re.search(r"\b(github|portfolio|personal\s+site|linkedin)\b", field_text, re.I) is None
    )


def keep_open(
    args: argparse.Namespace,
    browser: Any,
    original_url: str,
    workdir: Path,
    mark_applied_state: dict[str, Any] | None = None,
) -> None:
    if args.headless:
        browser.close()
        return
    if args.close_after > 0:
        deadline = time.time() + args.close_after
        while time.time() < deadline:
            if google_block_detected(browser):
                print("Google sign-in blocked the automation browser. Switching to normal browser handoff.")
                browser.close()
                open_manual_handoff(original_url, workdir)
                return
            if ashby_spam_block_detected(browser, mark_applied_state):
                browser.close()
                open_manual_handoff(original_url, workdir)
                return
            maybe_mark_manual_submit(browser, workdir, mark_applied_state)
            if browser_was_closed_without_pages(browser, mark_applied_state):
                return
            maybe_report_field_learning(browser, mark_applied_state)
            time.sleep(1)
        browser.close()
        return
    try:
        while True:
            if google_block_detected(browser):
                print("Google sign-in blocked the automation browser. Switching to normal browser handoff.")
                browser.close()
                open_manual_handoff(original_url, workdir)
                return
            if ashby_spam_block_detected(browser, mark_applied_state):
                browser.close()
                open_manual_handoff(original_url, workdir)
                return
            maybe_mark_manual_submit(browser, workdir, mark_applied_state)
            if browser_was_closed_without_pages(browser, mark_applied_state):
                return
            maybe_report_field_learning(browser, mark_applied_state)
            time.sleep(1)
    except KeyboardInterrupt:
        browser.close()


def maybe_mark_manual_submit(browser: Any, workdir: Path, mark_applied_state: dict[str, Any] | None) -> None:
    if not mark_applied_state or mark_applied_state.get("marked"):
        return

    install_manual_submit_watchers(browser, mark_applied_state)
    confirmation_page = first_submit_confirmation_page(browser)
    if not confirmation_page:
        submit_intent = latest_manual_submit_intent(browser, mark_applied_state)
        if not submit_intent:
            return
        elapsed_seconds = max(0, (time.time() * 1000 - float(submit_intent.get("at") or 0)) / 1000)
        if elapsed_seconds < 4:
            return
        if any(validation_error_detected(page) for page in browser_pages(browser)):
            return
        if not mark_applied_state.get("submit_intent_reported"):
            print(f"Manual submit button click detected: {str(submit_intent.get('descriptor') or 'submit control')[:160]}")
            post_workflow_event(
                mark_applied_state,
                "submit_intent_detected",
                "Manual submit button click detected.",
                {"submitIntent": submit_intent},
            )
            mark_applied_state["submit_intent_reported"] = True
        return

    print("Manual submit confirmation detected.")
    capture_submit_confirmation(confirmation_page, workdir)
    event_posted = post_workflow_event(
        mark_applied_state,
        "submit_confirmation",
        "Manual submit confirmation detected.",
        {"submitIntent": latest_manual_submit_intent(browser, mark_applied_state)},
    )
    marked = event_posted or mark_application_applied(
        str(mark_applied_state["app_url"]),
        str(mark_applied_state["application_id"]),
        "manual submit confirmation",
    )
    mark_applied_state["marked"] = marked


def ashby_spam_block_detected(browser: Any, state: dict[str, Any] | None) -> bool:
    if not state:
        return False
    package = state.get("package") if isinstance(state.get("package"), dict) else {}
    if not any(is_ashby_application(page.url, package) for page in browser_pages(browser)):
        return False
    for page in browser_pages(browser):
        try:
            body_text = page.inner_text("body", timeout=500)
        except Exception:
            continue
        if ASHBY_SPAM_BLOCK_PATTERNS.search(body_text):
            if not state.get("ashby_spam_block_reported"):
                args = argparse.Namespace(application_id=state.get("application_id"))
                emit_ashby_spam_block(args, page)
                post_workflow_event(
                    state,
                    "blocker_found",
                    "Ashby blocked submission as possible spam or reCAPTCHA risk.",
                    {
                        "blockerType": "ats_spam_block",
                        "url": page.url,
                        "atsProvider": "ashby",
                        "safeRetry": "normal_chrome_extension_assist",
                    },
                )
                state["ashby_spam_block_reported"] = True
            return True
    return False


def maybe_report_field_learning(browser: Any, state: dict[str, Any] | None) -> None:
    if not state:
        return
    now = time.time()
    last_check = float(state.get("last_learning_check") or 0)
    if now - last_check < 5:
        return
    state["last_learning_check"] = now

    baseline = state.get("learning_baseline")
    if not isinstance(baseline, dict):
        return
    reported = state.get("reported_learning_keys")
    if not isinstance(reported, set):
        reported = set()
        state["reported_learning_keys"] = reported

    candidates: list[dict[str, str]] = []
    for page in browser_pages(browser):
        for context in application_contexts(page):
            try:
                current = snapshot_fields_in_contexts([context])
            except Exception as exc:
                print(f"Field learning snapshot skipped because the page changed: {exc}", file=sys.stderr)
                continue
            for key, field in current.items():
                answer = str(field.get("answer") or "").strip()
                if not answer:
                    continue
                original = baseline.get(key)
                original_answer = str(original.get("answer") or "").strip() if isinstance(original, dict) else ""
                if answer == original_answer:
                    continue
                if str(field.get("assistantFilled") or "") == "true" and not original_answer:
                    continue
                dedupe_key = f"{key}:{answer}"
                if dedupe_key in reported:
                    continue
                reported.add(dedupe_key)
                candidates.append({
                    "fieldKey": field.get("fieldKey", ""),
                    "category": field.get("category", "custom"),
                    "label": field.get("label", ""),
                    "inputType": field.get("inputType", ""),
                    "selector": field.get("selector", ""),
                    "answer": answer,
                    "source": "manual_observation",
                    "confidence": 84,
                })

    if not candidates:
        return
    app_url = str(state.get("app_url") or "")
    application_id = str(state.get("application_id") or "")
    package = state.get("package") if isinstance(state.get("package"), dict) else {}
    host = str(package.get("job", {}).get("applicationHost") or urlparse(str(package.get("job", {}).get("applicationUrl") or "")).hostname or "unknown")
    try:
        result = post_json(
            f"{app_url.rstrip('/')}/api/applications/{application_id}/field-learning",
            {"host": host.removeprefix("www."), "fields": candidates},
        )
        print(f"Field learning updated: saved {result.get('saved', 0)}, ignored {result.get('ignored', 0)} observed manual field(s).")
        post_workflow_event(
            state,
            "manual_input_observed",
            f"Observed {len(candidates)} manually completed field(s) for future learning.",
            {
                "fields": [
                    {
                        "fieldId": field.get("fieldKey", ""),
                        "category": field.get("category", "custom"),
                        "label": field.get("label", ""),
                        "inputType": field.get("inputType", ""),
                        "selector": field.get("selector", ""),
                        "status": "observed",
                    }
                    for field in candidates
                ],
            },
        )
    except Exception as exc:
        print(f"Unable to save observed field learning: {exc}", file=sys.stderr)


def first_submit_confirmation_page(browser: Any) -> Any | None:
    for page in browser_pages(browser):
        try:
            if submit_confirmation_detected(page):
                return page
        except Exception:
            continue
    return None


def install_manual_submit_watchers(browser: Any, state: dict[str, Any] | None = None) -> None:
    install_submit_intent_binding(browser, state)
    for page in browser_pages(browser):
        for context in application_contexts(page):
            try:
                context.evaluate(
                    """() => {
                      if (window.__joleneSubmitWatcherInstalled) return;
                      window.__joleneSubmitWatcherInstalled = true;
                      window.__joleneSubmitIntent = window.__joleneSubmitIntent || null;
                      const submitPattern = /submit|send application|apply now|complete application|finish/i;
                      const descriptor = (node) => {
                        if (!node) return "";
                        const label = node.labels && node.labels.length
                          ? Array.from(node.labels).map((item) => item.innerText || "").join(" ")
                          : "";
                        return [
                          label,
                          node.innerText,
                          node.value,
                          node.getAttribute && node.getAttribute("name"),
                          node.getAttribute && node.getAttribute("id"),
                          node.getAttribute && node.getAttribute("aria-label"),
                          node.getAttribute && node.getAttribute("title"),
                          node.getAttribute && node.getAttribute("type")
                        ].filter(Boolean).join(" ").replace(/\\s+/g, " ").trim();
                      };
                      const record = (source, node) => {
                        const intent = {
                          at: Date.now(),
                          source,
                          descriptor: descriptor(node),
                          url: window.location.href
                        };
                          window.__joleneSubmitIntent = intent;
                          try {
                            window.localStorage.setItem("__joleneSubmitIntent", JSON.stringify(intent));
                          } catch (error) {}
                          if (window.__joleneRecordSubmitIntent) {
                            try { window.__joleneRecordSubmitIntent(intent); } catch (error) {}
                          }
                        };
                      document.addEventListener("click", (event) => {
                        const node = event.target && event.target.closest
                          ? event.target.closest("button,input[type='submit'],[role='button'],a")
                          : null;
                        if (!node) return;
                        const text = descriptor(node);
                        if (submitPattern.test(text)) record("click", node);
                      }, true);
                      document.addEventListener("submit", (event) => {
                        record("form_submit", event.target);
                      }, true);
                    }"""
                )
            except Exception:
                continue


def latest_manual_submit_intent(browser: Any, state: dict[str, Any] | None = None) -> dict[str, Any] | None:
    latest: dict[str, Any] | None = state.get("latest_submit_intent") if isinstance(state, dict) and isinstance(state.get("latest_submit_intent"), dict) else None
    for page in browser_pages(browser):
        for context in application_contexts(page):
            try:
                value = context.evaluate(
                    """() => {
                      if (window.__joleneSubmitIntent) return window.__joleneSubmitIntent;
                      try {
                        const raw = window.localStorage.getItem("__joleneSubmitIntent");
                        return raw ? JSON.parse(raw) : null;
                      } catch (error) {
                        return null;
                      }
                    }"""
                )
            except Exception:
                continue
            if not isinstance(value, dict):
                continue
            if latest is None or float(value.get("at") or 0) > float(latest.get("at") or 0):
                latest = value
    return latest


def install_submit_intent_binding(browser: Any, state: dict[str, Any] | None = None) -> None:
    if not state or state.get("submit_binding_installed"):
        return

    def record_submit_intent(source: Any, intent: Any) -> None:
        if isinstance(intent, dict):
            state["latest_submit_intent"] = intent

    for context in browser_contexts(browser):
        try:
            context.expose_binding("__joleneRecordSubmitIntent", record_submit_intent)
            state["submit_binding_installed"] = True
        except Exception:
            continue


def browser_was_closed_without_pages(browser: Any, state: dict[str, Any] | None = None) -> bool:
    if browser_pages(browser):
        return False
    if state and state.get("marked"):
        return True
    submit_intent = state.get("latest_submit_intent") if isinstance(state, dict) else None
    if isinstance(submit_intent, dict):
        elapsed_seconds = max(0, (time.time() * 1000 - float(submit_intent.get("at") or 0)) / 1000)
        if elapsed_seconds < 4:
            return False
        print(f"Browser closed after manual submit click: {str(submit_intent.get('descriptor') or 'submit control')[:160]}")
        if state:
            assistant_event(str(state.get("application_id") or ""), "browser_closed_after_submit", "Assistant browser closed after a manual submit click.", {
                "submitIntent": submit_intent,
                "closeReason": "after_submit",
            })
        event_posted = post_workflow_event(
            state,
            "browser_closed_after_submit",
            "Assistant browser closed after manual submit click.",
            {"submitIntent": submit_intent, "closeReason": "after_submit"},
        )
        marked = event_posted or mark_application_applied(
            str(state.get("app_url") or ""),
            str(state.get("application_id") or ""),
            "manual submit button click before browser close",
        )
        state["marked"] = marked
        return True
    print("Assistant browser/page closed before a submission confirmation was observed.")
    if state:
        assistant_event(str(state.get("application_id") or ""), "browser_closed_without_submit", "Assistant browser closed before submit confirmation.", {
            "closeReason": "without_submit",
            "safeRetry": "relaunch_or_mark_applied_if_submitted",
        })
    post_workflow_event(
        state,
        "browser_closed_without_submit",
        "Assistant browser closed before submit.",
        {"closeReason": "without_submit"},
    )
    return True


def validation_error_detected(page: Any) -> bool:
    try:
        body_text = page.inner_text("body", timeout=500)
    except Exception:
        return False
    if not VALIDATION_ERROR_PATTERNS.search(body_text):
        return False
    if submit_confirmation_detected(page):
        return False
    return True


def mark_application_applied(app_url: str, application_id: str, source: str) -> bool:
    endpoint = f"{app_url.rstrip('/')}/api/applications/{application_id}/mark-applied"
    try:
        result = post_json(endpoint, {"source": source})
        message = result.get("message") or "Application marked applied."
        print(f"Tracker updated: {message}")
        return True
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        print(f"Unable to mark application applied: HTTP {exc.code} {details}", file=sys.stderr)
    except Exception as exc:
        print(f"Unable to mark application applied: {exc}", file=sys.stderr)
    return False


def google_block_detected(browser: Any) -> bool:
    for page in browser_pages(browser):
        try:
            if "accounts.google." in page.url:
                return True
            body_text = page.inner_text("body", timeout=500)
            if GOOGLE_BLOCK_PATTERNS.search(body_text):
                return True
        except Exception:
            continue
    return False


def browser_pages(browser: Any) -> list[Any]:
    try:
        pages = getattr(browser, "pages", None)
        if pages is not None:
            return list(pages)
    except Exception:
        return []


def browser_contexts(browser: Any) -> list[Any]:
    if hasattr(browser, "expose_binding"):
        return [browser]
    try:
        return list(browser.contexts)
    except Exception:
        return []

    try:
        pages = []
        for context in browser.contexts:
            pages.extend(context.pages)
        return pages
    except Exception:
        return []


def open_manual_handoff(url: str, workdir: Path) -> None:
    if platform.system() == "Darwin":
        subprocess.run(["open", url], check=False)
        subprocess.run(["open", str(workdir)], check=False)
        return

    webbrowser.open(url)


if __name__ == "__main__":
    raise SystemExit(main())
