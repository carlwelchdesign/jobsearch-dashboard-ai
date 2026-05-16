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
    "veteranStatus": re.compile(r"veteran", re.I),
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
        bring_browser_to_front(page)
        page.wait_for_timeout(2500)
        open_embedded_application_form(page)
        page.wait_for_timeout(1000)
        body_text = page.inner_text("body", timeout=5000)

        if CLOSED_JOB_PATTERNS.search(body_text) or "404" in page.title():
            print("This application page appears to be closed, removed, or unavailable. No form can be filled.")
            browser_or_context.close()
            return 0

        if "accounts.google." in page.url or GOOGLE_BLOCK_PATTERNS.search(body_text):
            print("Google sign-in blocked the automation browser. Handing off to normal Chrome.")
            browser_or_context.close()
            open_manual_handoff(package["job"]["applicationUrl"], workdir)
            print("Complete login/application manually in the normal Chrome window.")
            return 0

        if CAPTCHA_PATTERNS.search(body_text):
            print("CAPTCHA or human verification text detected. Stopping for manual handling.")
            browser_or_context.close()
            open_manual_handoff(package["job"]["applicationUrl"], workdir)
            return 0

        form_contexts = application_contexts(page)
        print(f"Scanning {len(form_contexts)} page/frame context(s) for application fields.")
        inventory_before = detect_fields_in_contexts(form_contexts)
        print_field_inventory("Detected fields before filling", inventory_before)

        filled = sum(fill_safe_fields(context, package["candidate"]) for context in form_contexts)
        learned_filled = sum(fill_learned_form_rules(context, package) for context in form_contexts)
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

        print()
        print(f"Filled {filled} safe text fields.")
        print(f"Filled {learned_filled} learned recurring field(s).")
        print(f"Filled {demographic_filled} configured demographic field(s).")
        print(f"Uploaded {uploads} material file(s).")
        if filled == 0 and uploads == 0:
            print("No fillable application fields or matching upload controls were found on this page.")
            print("This is often a job listing page, login page, or intermediary board rather than the final application form.")
        application_marked_applied = False
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
        print("Sensitive demographic, salary, and custom questions were intentionally left untouched unless explicitly configured.")
        if selected_answers_text:
            print(f"Use selected custom-answer drafts from: {selected_answers_text}")
        install_manual_submit_watchers(browser_or_context)
        keep_open(
            args,
            browser_or_context,
            package["job"]["applicationUrl"],
            workdir,
            mark_applied_state={
                "application_id": args.application_id,
                "app_url": args.app_url,
                "marked": application_marked_applied,
            },
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


def fill_safe_fields(page: Any, candidate: dict[str, str]) -> int:
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
    }
    filled = fill_by_known_selectors(page, values)
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
            match_key = match_safe_key(field_text)
            if not match_key or not values.get(match_key):
                continue
            fill_element(element, values[match_key])
            filled += 1
        except Exception:
            continue

    return filled


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
    uploaded_name = element.evaluate("node => node.files && node.files[0] ? node.files[0].name : ''")
    if not uploaded_name:
        raise RuntimeError("browser did not report a selected file after upload")


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
            option_value = matching_option_value(element, answer)
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
            option_value = matching_option_value(element, PHONE_COUNTRY_ANSWER)
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


def matching_option_value(select: Any, answer: str) -> str | None:
    options = select.evaluate(
        """node => Array.from(node.options).map(option => ({
          value: option.value,
          text: option.textContent || ''
        }))"""
    )
    for option in options:
        text = str(option.get("text", ""))
        value = str(option.get("value", ""))
        if answer_matches_descriptor(answer, f"{text} {value}"):
            return value
    return None


def answer_matches_descriptor(answer: str, descriptor: str) -> bool:
    answer_tokens = normalize_for_match(answer)
    descriptor_tokens = normalize_for_match(descriptor)
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


def normalize_for_match(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


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


def fill_by_known_selectors(page: Any, values: dict[str, str]) -> int:
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
                    fill_element(element, value)
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
        print("Auto-submit skipped: CAPTCHA or human verification text detected.")
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
            maybe_mark_manual_submit(browser, workdir, mark_applied_state)
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
            maybe_mark_manual_submit(browser, workdir, mark_applied_state)
            time.sleep(1)
    except KeyboardInterrupt:
        browser.close()


def maybe_mark_manual_submit(browser: Any, workdir: Path, mark_applied_state: dict[str, Any] | None) -> None:
    if not mark_applied_state or mark_applied_state.get("marked"):
        return

    install_manual_submit_watchers(browser)
    confirmation_page = first_submit_confirmation_page(browser)
    if not confirmation_page:
        submit_intent = latest_manual_submit_intent(browser)
        if not submit_intent:
            return
        elapsed_seconds = max(0, (time.time() * 1000 - float(submit_intent.get("at") or 0)) / 1000)
        if elapsed_seconds < 4:
            return
        if any(validation_error_detected(page) for page in browser_pages(browser)):
            return
        print(f"Manual submit button click detected: {str(submit_intent.get('descriptor') or 'submit control')[:160]}")
        marked = mark_application_applied(
            str(mark_applied_state["app_url"]),
            str(mark_applied_state["application_id"]),
            "manual submit button click",
        )
        mark_applied_state["marked"] = marked
        return

    print("Manual submit confirmation detected.")
    capture_submit_confirmation(confirmation_page, workdir)
    marked = mark_application_applied(
        str(mark_applied_state["app_url"]),
        str(mark_applied_state["application_id"]),
        "manual submit confirmation",
    )
    mark_applied_state["marked"] = marked


def first_submit_confirmation_page(browser: Any) -> Any | None:
    for page in browser_pages(browser):
        try:
            if submit_confirmation_detected(page):
                return page
        except Exception:
            continue
    return None


def install_manual_submit_watchers(browser: Any) -> None:
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


def latest_manual_submit_intent(browser: Any) -> dict[str, Any] | None:
    latest: dict[str, Any] | None = None
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
