import path from "node:path";
import PDFDocument from "pdfkit";
import { parseResumeDocument, type ResumeDocument } from "@/lib/resumes/resume-document";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 24;
const RIGHT = 588;
const CONTENT_TOP = 138;
const BOTTOM = 750;
const COLUMN_GAP = 48;
const EXPERIENCE_WIDTH = 297;
const SIDEBAR_X = LEFT + EXPERIENCE_WIDTH + COLUMN_GAP;
const SIDEBAR_WIDTH = 194.4;
const BLUE = "#0475ee";
const INK = "#0d0f14";
const MUTED = "#4d5663";
const CHIP_FILL = "#dcebff";
const CHIP_TEXT = "#035fbf";
const DIVIDER = "#dbdfe6";
const BODY_SIZE = 7.35;
const BODY_LEADING = 9.5;
const SMALL_SIZE = 6.85;
const BULLET_INDENT = 10;
const CHIP_FONT_SIZE = 6.1;
const CHIP_HEIGHT = 9.2;
const CHIP_X_PADDING = 3;
const CHIP_GAP = 3.2;
const CONTACT_SIZE = 7.2;
const FONT_REGULAR = "Roboto";
const FONT_BOLD = "RobotoBold";
const ROBOTO_REGULAR_PATH = fontAssetPath("roboto-latin-400-normal.woff");
const ROBOTO_BOLD_PATH = fontAssetPath("roboto-latin-700-normal.woff");
const MUI_ICON_PATHS = {
  phone: "M6.54 5c.06.89.21 1.76.45 2.59l-1.2 1.2c-.41-1.2-.67-2.47-.76-3.79zm9.86 12.02c.85.24 1.72.39 2.6.45v1.49c-1.32-.09-2.59-.35-3.8-.75zM7.5 3H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.49c0-.55-.45-1-1-1-1.24 0-2.45-.2-3.57-.57-.1-.04-.21-.05-.31-.05-.26 0-.51.1-.71.29l-2.2 2.2c-2.83-1.45-5.15-3.76-6.59-6.59l2.2-2.2c.28-.28.36-.67.25-1.02C8.7 6.45 8.5 5.25 8.5 4c0-.55-.45-1-1-1",
  email: "M12 1.95c-5.52 0-10 4.48-10 10s4.48 10 10 10h5v-2h-5c-4.34 0-8-3.66-8-8s3.66-8 8-8 8 3.66 8 8v1.43c0 .79-.71 1.57-1.5 1.57s-1.5-.78-1.5-1.57v-1.43c0-2.76-2.24-5-5-5s-5 2.24-5 5 2.24 5 5 5c1.38 0 2.64-.56 3.54-1.47.65.89 1.77 1.47 2.96 1.47 1.97 0 3.5-1.6 3.5-3.57v-1.43c0-5.52-4.48-10-10-10m0 13c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3",
  link: "M17 7h-4v2h4c1.65 0 3 1.35 3 3s-1.35 3-3 3h-4v2h4c2.76 0 5-2.24 5-5s-2.24-5-5-5m-6 8H7c-1.65 0-3-1.35-3-3s1.35-3 3-3h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4zm-3-4h8v2H8z",
  calendar: "M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2m0 16H5V10h14zm0-12H5V6h14zM9 14H7v-2h2zm4 0h-2v-2h2zm4 0h-2v-2h2zm-8 4H7v-2h2zm4 0h-2v-2h2zm4 0h-2v-2h2z",
} as const;

type PdfFont = "regular" | "bold";

type PdfLine = {
  text: string;
  size: number;
  font: PdfFont;
  leading: number;
  gapBefore?: number;
  bullet?: boolean;
  color?: string;
  kind?: "section" | "role-separator" | "chip-row" | "date-line";
  chips?: string[];
};

type ContactItem = {
  kind: "phone" | "email" | "link";
  label: string;
};

type PageColumn = {
  lines: PdfLine[];
  x: number;
  y: number;
  width: number;
};

type ResumePdfImage = {
  bytes: Uint8Array;
  mimeType: string;
};

type PdfMetrics = {
  widthOfString: (value: string, size: number, font: PdfFont) => number;
};

export async function createModernTwoColumnResumePdf(text: string, options: { profileImage?: ResumePdfImage | null } = {}): Promise<Uint8Array<ArrayBuffer>> {
  const document = parseResumeDocument(text);
  const pdf = new PDFDocument({ autoFirstPage: false, compress: false, margin: 0, size: [PAGE_WIDTH, PAGE_HEIGHT] });
  registerResumeFonts(pdf);
  const pages = layoutPages(document, pdfMetrics(pdf));
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });

  for (const [pageIndex, page] of pages.entries()) {
    pdf.addPage({ margin: 0, size: [PAGE_WIDTH, PAGE_HEIGHT] });
    pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill("#ffffff");
    if (pageIndex === 0) renderHeader(pdf, document, options.profileImage);
    else renderContinuationHeader(pdf, document.name, pageIndex + 1);
    renderColumn(pdf, page.left);
    renderColumn(pdf, page.right);
  }

  pdf.end();
  const buffer = await done;
  const output = new Uint8Array(buffer.byteLength);
  output.set(buffer);
  return output;
}

function registerResumeFonts(pdf: PDFKit.PDFDocument) {
  pdf.registerFont(FONT_REGULAR, ROBOTO_REGULAR_PATH);
  pdf.registerFont(FONT_BOLD, ROBOTO_BOLD_PATH);
}

function fontAssetPath(fileName: string) {
  return path.join(process.cwd(), "node_modules", "@fontsource", "roboto", "files", fileName);
}

function pdfMetrics(pdf: PDFKit.PDFDocument): PdfMetrics {
  return {
    widthOfString(value, size, font) {
      return pdf.font(fontName(font)).fontSize(size).widthOfString(value);
    },
  };
}

function layoutPages(document: ResumeDocument, metrics: PdfMetrics) {
  const leftLines = [
    section("Experience"),
    ...document.experience.flatMap((item) => [
      roleLine(item.role ?? item.title),
      ...(item.company ? [bodyLine(item.company, 7.4, "bold", BLUE)] : []),
      ...(item.dates ? [dateLine(item.dates)] : []),
      ...(item.skills.length ? wrapBody(`Skills: ${item.skills.join(", ")}`, EXPERIENCE_WIDTH, metrics, BODY_SIZE) : []),
      ...item.bullets.slice(0, 5).flatMap((bullet) => bulletLines(bullet, EXPERIENCE_WIDTH - BULLET_INDENT, metrics)),
      roleSeparator(),
    ]),
  ];
  const rightLines = [
    section("Summary"),
    ...document.summary.flatMap((line) => wrapBody(line, SIDEBAR_WIDTH, metrics, BODY_SIZE)),
    section("Education"),
    ...document.education.flatMap((line) => wrapBody(line, SIDEBAR_WIDTH, metrics, BODY_SIZE, true)),
    ...(document.certifications.length ? [section("Certifications"), ...document.certifications.flatMap((line) => wrapBody(line, SIDEBAR_WIDTH, metrics, BODY_SIZE, true))] : []),
    section("Skills"),
    ...skillChipRows(document.skills, metrics),
    section("Projects"),
    ...document.projects.slice(0, 4).flatMap((project) => [
      roleLine(project.name, 8.4),
      ...wrapBody(project.description, SIDEBAR_WIDTH, metrics, BODY_SIZE),
    ]),
  ];

  const pages: Array<{ left: PageColumn; right: PageColumn }> = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < leftLines.length || rightIndex < rightLines.length || pages.length === 0) {
    const top = pages.length === 0 ? CONTENT_TOP : 52;
    const left = nextColumn(leftLines, leftIndex, LEFT, top, EXPERIENCE_WIDTH);
    const right = nextColumn(rightLines, rightIndex, SIDEBAR_X, top, SIDEBAR_WIDTH);
    leftIndex = left.nextIndex;
    rightIndex = right.nextIndex;
    pages.push({ left: left.column, right: right.column });
  }
  return pages;
}

function nextColumn(lines: PdfLine[], startIndex: number, x: number, y: number, width: number) {
  const selected: PdfLine[] = [];
  let cursorY = y;
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    const nextY = cursorY + (line.gapBefore ?? 0) + line.leading;
    if (nextY > BOTTOM && selected.length) break;
    selected.push(line);
    cursorY = nextY;
    index += 1;
  }
  return { nextIndex: index, column: { lines: selected, x, y, width } };
}

function renderHeader(pdf: PDFKit.PDFDocument, document: ResumeDocument, profileImage: ResumePdfImage | null | undefined) {
  drawText(pdf, document.name.toUpperCase(), LEFT, 31, 18.5, "bold", "#000000");
  drawText(pdf, document.headline, LEFT, 55, 9.1, "bold", BLUE);
  renderContactItems(pdf, contactItems(document.contactLine), LEFT, 82);
  renderBadge(pdf, document, profileImage);
}

function renderBadge(pdf: PDFKit.PDFDocument, document: ResumeDocument, image: ResumePdfImage | null | undefined) {
  const initials = document.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CV";
  const radius = 28;
  const cx = SIDEBAR_X + SIDEBAR_WIDTH - radius;
  const cy = 72;
  if (image && /^image\/(?:jpe?g|png)$/i.test(image.mimeType)) {
    pdf.save();
    pdf.circle(cx, cy, radius).clip();
    pdf.image(Buffer.from(image.bytes), cx - radius, cy - radius, { width: radius * 2, height: radius * 2 });
    pdf.restore();
    pdf.circle(cx, cy, radius).lineWidth(1.2).stroke(BLUE);
    return;
  }
  pdf.circle(cx, cy, radius).fill(BLUE);
  drawText(pdf, initials, cx - 13, cy - 7, 15.5, "bold", "#000000");
}

function renderContinuationHeader(pdf: PDFKit.PDFDocument, name: string, page: number) {
  drawText(pdf, `${name} - resume continued`, LEFT, 36, 8.5, "bold", MUTED);
  drawText(pdf, `Page ${page}`, 552, 36, 8, "regular", MUTED);
  pdf.moveTo(LEFT, 54).lineTo(RIGHT, 54).lineWidth(0.5).stroke(DIVIDER);
}

function renderColumn(pdf: PDFKit.PDFDocument, column: PageColumn) {
  let y = column.y;
  for (const line of column.lines) {
    y += line.gapBefore ?? 0;
    if (isSection(line)) {
      drawText(pdf, line.text.toUpperCase(), column.x, y, line.size, "bold", "#000000");
      pdf.moveTo(column.x, y + 12).lineTo(column.x + column.width, y + 12).lineWidth(1).stroke("#000000");
    } else if (line.kind === "role-separator") {
      pdf.moveTo(column.x, y + 1).lineTo(column.x + column.width, y + 1).lineWidth(0.45).stroke(DIVIDER);
    } else if (line.kind === "chip-row" && line.chips) {
      renderChipRow(pdf, line.chips, column.x, y);
    } else if (line.kind === "date-line") {
      muiIcon(pdf, MUI_ICON_PATHS.calendar, column.x, y - 1.3, 7.8, MUTED);
      drawText(pdf, line.text, column.x + 12, y, line.size, line.font, line.color ?? MUTED);
    } else if (line.bullet) {
      pdf.circle(column.x + 3.2, y + 4.1, 1.25).fill("#000000");
      drawText(pdf, line.text, column.x + 10, y, line.size, line.font, INK);
    } else {
      drawText(pdf, line.text, column.x, y, line.size, line.font, line.color ?? (line.font === "bold" ? INK : MUTED));
    }
    y += line.leading;
  }
}

function section(textValue: string): PdfLine {
  return { text: textValue, size: 9.8, font: "bold", leading: 14, gapBefore: 10, kind: "section" };
}

function roleLine(textValue: string, size = 9.4): PdfLine {
  return { text: textValue, size, font: "bold", leading: 11, gapBefore: 7 };
}

function bodyLine(textValue: string, size = BODY_SIZE, font: PdfFont = "regular", color?: string): PdfLine {
  return { text: textValue, size, font, color, leading: BODY_LEADING, gapBefore: 2 };
}

function dateLine(textValue: string): PdfLine {
  return { text: normalizeDateRange(textValue), size: SMALL_SIZE, font: "regular", color: MUTED, leading: 9.5, gapBefore: 2, kind: "date-line" };
}

function bulletLines(textValue: string, width: number, metrics: PdfMetrics) {
  return wrapPdfTextByWidth(textValue, width, BODY_SIZE, "regular", metrics).map((line, index) => ({ ...bodyLine(line, BODY_SIZE, "regular", INK), bullet: index === 0, gapBefore: index === 0 ? 2.2 : 0 }));
}

function wrapBody(textValue: string, width: number, metrics: PdfMetrics, size = BODY_SIZE, bold = false) {
  const font = bold ? "bold" as const : "regular" as const;
  return wrapPdfTextByWidth(textValue, width, size, font, metrics).map((line, index) => ({ ...bodyLine(line, size), font, gapBefore: index === 0 ? 2 : 0 }));
}

function skillChipRows(skills: string[], metrics: PdfMetrics) {
  const lines: PdfLine[] = [];
  let row: string[] = [];
  let rowWidth = 0;
  for (const skill of skills.slice(0, 28)) {
    const chipWidth = chipTextWidth(skill, metrics);
    if (row.length && rowWidth + chipWidth + CHIP_GAP > SIDEBAR_WIDTH) {
      lines.push(chipRow(row));
      row = [];
      rowWidth = 0;
    }
    row.push(skill);
    rowWidth += chipWidth + (row.length > 1 ? CHIP_GAP : 0);
  }
  if (row.length) lines.push(chipRow(row));
  return lines;
}

function isSection(line: PdfLine) {
  return line.kind === "section";
}

function roleSeparator(): PdfLine {
  return { text: "", size: 1, font: "regular", leading: 6, gapBefore: 5, kind: "role-separator" };
}

function chipRow(chips: string[]): PdfLine {
  return { text: chips.join(" "), size: CHIP_FONT_SIZE, font: "bold", leading: 11.2, gapBefore: 2, kind: "chip-row", chips };
}

function renderChipRow(pdf: PDFKit.PDFDocument, chips: string[], x: number, y: number) {
  let cursorX = x;
  const metrics = pdfMetrics(pdf);
  for (const chip of chips) {
    const width = chipTextWidth(chip, metrics);
    pdf.roundedRect(cursorX, y - 1, width, CHIP_HEIGHT, 2).fill(CHIP_FILL);
    drawText(pdf, chip, cursorX + CHIP_X_PADDING, y + 1.7, CHIP_FONT_SIZE, "bold", CHIP_TEXT);
    cursorX += width + CHIP_GAP;
  }
}

function chipTextWidth(value: string, metrics: PdfMetrics) {
  return Math.max(16, metrics.widthOfString(value, CHIP_FONT_SIZE, "bold") + CHIP_X_PADDING * 2);
}

function contactItems(contactLine: string): ContactItem[] {
  return contactLine.split(/\s*\|\s*/).flatMap<ContactItem>((part) => {
    const trimmed = part.trim();
    if (!trimmed) return [];
    const label = trimmed.replace(/^https?:\/\/(?:www\.)?/i, "");
    if (/@/.test(trimmed)) return [{ kind: "email" as const, label }];
    if (/github\.com|linkedin\.com|https?:\/\//i.test(trimmed)) return [{ kind: "link" as const, label }];
    return [{ kind: "phone" as const, label }];
  }).sort((a, b) => contactPriority(a) - contactPriority(b));
}

function contactPriority(item: ContactItem) {
  if (item.kind === "phone") return 0;
  if (item.kind === "email") return 1;
  if (/linkedin\.com/i.test(item.label)) return 2;
  if (/github\.com/i.test(item.label)) return 3;
  return 4;
}

function renderContactItems(pdf: PDFKit.PDFDocument, items: ContactItem[], x: number, y: number) {
  let cursorX = x;
  const metrics = pdfMetrics(pdf);
  for (const item of items) {
    const iconSize = 7.8;
    if (item.kind === "phone") muiIcon(pdf, MUI_ICON_PATHS.phone, cursorX, y + 0.3, iconSize, BLUE);
    else if (item.kind === "email") muiIcon(pdf, MUI_ICON_PATHS.email, cursorX, y + 0.3, iconSize, BLUE);
    else muiIcon(pdf, MUI_ICON_PATHS.link, cursorX, y + 0.3, iconSize, BLUE);

    const labelX = cursorX + 11;
    drawText(pdf, item.label, labelX, y, CONTACT_SIZE, "bold", MUTED);
    cursorX = labelX + metrics.widthOfString(item.label, CONTACT_SIZE, "bold") + 14;
  }
}

export function wrapPdfTextByWidth(value: string, maxWidth: number, size = BODY_SIZE, font: PdfFont = "regular", metrics = approximateMetrics): string[] {
  if (!value) return [];
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (metrics.widthOfString(candidate, size, font) > maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const approximateMetrics: PdfMetrics = {
  widthOfString(value, size, font) {
    const fontWeight = font === "bold" ? 1.07 : 1;
    let units = 0;
    for (const char of value) {
      if (char === " ") units += 0.28;
      else if ("ilI.,'|".includes(char)) units += 0.22;
      else if ("mwMW@".includes(char)) units += 0.82;
      else if (/[A-Z]/.test(char)) units += 0.62;
      else if (/[0-9]/.test(char)) units += 0.53;
      else units += 0.48;
    }
    return units * size * fontWeight;
  },
};

function drawText(pdf: PDFKit.PDFDocument, value: string, x: number, y: number, size: number, font: PdfFont, color: string) {
  pdf.fillColor(color).font(fontName(font)).fontSize(size).text(cleanPdfText(value), x, y, { lineBreak: false });
}

function fontName(font: PdfFont) {
  return font === "bold" ? FONT_BOLD : FONT_REGULAR;
}

function muiIcon(pdf: PDFKit.PDFDocument, path: string, x: number, y: number, size: number, color: string) {
  const scale = size / 24;
  pdf.save();
  pdf.translate(x, y + size);
  pdf.scale(scale, -scale);
  pdf.path(path).fill(color);
  pdf.restore();
}

function normalizeDateRange(value: string) {
  return value
    .replace(/\b(\d{4})-(\d{2})\b/g, "$1/$2")
    .replace(/\b(\d{1,2})\/(\d{4})\b/g, (_match, month: string, year: string) => `${month.padStart(2, "0")}/${year}`);
}

function cleanPdfText(value: string) {
  return value
    .replace(/[–—‒―]/g, "-")
    .replace(/[''‚]/g, "'")
    .replace(/[""„]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x00-\x7F]/g, "");
}
