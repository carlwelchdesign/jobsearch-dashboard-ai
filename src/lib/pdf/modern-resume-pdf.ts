import { parseResumeDocument, type ResumeDocument } from "@/lib/resumes/resume-document";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 28;
const RIGHT = 584;
const TOP = 752;
const BOTTOM = 42;
const BLUE = "0.02 0.46 0.93";
const INK = "0.05 0.06 0.08";
const MUTED = "0.30 0.34 0.40";

type PdfLine = {
  text: string;
  size: number;
  font: "regular" | "bold";
  leading: number;
  gapBefore?: number;
  bullet?: boolean;
  color?: string;
};

type PageColumn = {
  lines: PdfLine[];
  x: number;
  y: number;
  width: number;
  widthChars: number;
};

export function createModernTwoColumnResumePdf(text: string): Uint8Array<ArrayBuffer> {
  const document = parseResumeDocument(text);
  const pages = layoutPages(document);
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const pageObjectIds: number[] = [];
  for (const [pageIndex, page] of pages.entries()) {
    const pageObjId = objects.length + 1;
    const contentObjId = pageObjId + 1;
    pageObjectIds.push(pageObjId);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjId} 0 R >>`);
    const content = [
      "q 1 1 1 rg 0 0 612 792 re f Q",
      pageIndex === 0 ? renderHeader(document) : renderContinuationHeader(document.name, pageIndex + 1),
      renderColumn(page.left),
      renderColumn(page.right),
    ].filter(Boolean).join("\n");
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  const chunks: string[] = ["%PDF-1.4\n"];
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(chunks.join("")));
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  }
  const xrefOffset = Buffer.byteLength(chunks.join(""));
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  for (const offset of offsets.slice(1)) chunks.push(`${offset.toString().padStart(10, "0")} 00000 n \n`);
  chunks.push(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const buffer = Buffer.from(chunks.join(""), "latin1");
  return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

function layoutPages(document: ResumeDocument) {
  const leftLines = [
    section("Experience"),
    ...document.experience.flatMap((item) => [
      roleLine(item.role ?? item.title),
      ...(item.company ? [bodyLine(item.company, 7.8, "bold", BLUE)] : []),
      ...(item.dates ? [bodyLine(item.dates, 7.2)] : []),
      ...(item.skills.length ? wrapBody(`Skills: ${item.skills.join(", ")}`, 57) : []),
      ...item.bullets.slice(0, 5).flatMap((bullet) => bulletLines(bullet, 54)),
    ]),
  ];
  const rightLines = [
    section("Summary"),
    ...document.summary.flatMap((line) => wrapBody(line, 34)),
    section("Education"),
    ...document.education.flatMap((line) => wrapBody(line, 34, true)),
    ...(document.certifications.length ? [section("Certifications"), ...document.certifications.flatMap((line) => wrapBody(line, 34, true))] : []),
    section("Skills"),
    ...skillLines(document.skills),
    section("Projects"),
    ...document.projects.slice(0, 4).flatMap((project) => [
      roleLine(project.name, 8.8),
      ...wrapBody(project.description, 34),
    ]),
  ];

  const pages: Array<{ left: PageColumn; right: PageColumn }> = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < leftLines.length || rightIndex < rightLines.length || pages.length === 0) {
    const top = pages.length === 0 ? 636 : 720;
    const left = nextColumn(leftLines, leftIndex, LEFT, top, 340, 58);
    const right = nextColumn(rightLines, rightIndex, 392, top, 192, 34);
    leftIndex = left.nextIndex;
    rightIndex = right.nextIndex;
    pages.push({ left: left.column, right: right.column });
  }
  return pages;
}

function nextColumn(lines: PdfLine[], startIndex: number, x: number, y: number, width: number, widthChars: number) {
  const selected: PdfLine[] = [];
  let cursorY = y;
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    const nextY = cursorY - (line.gapBefore ?? 0) - line.leading;
    if (nextY < BOTTOM && selected.length) break;
    selected.push(line);
    cursorY = nextY;
    index += 1;
  }
  return { nextIndex: index, column: { lines: selected, x, y, width, widthChars } };
}

function renderHeader(document: ResumeDocument) {
  const initials = document.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CV";
  const contact = document.contactLine.split(/\s*\|\s*/).filter(Boolean).join("   ");
  return [
    text(document.name.toUpperCase(), LEFT, TOP, 21, "bold", "0 0 0"),
    text(document.headline, LEFT, TOP - 18, 9.5, "bold", BLUE),
    text(contact, LEFT, TOP - 36, 7.2, "regular", MUTED),
    `q ${BLUE} rg 536 690 44 44 re f Q`,
    text(initials, 552, 707, 15, "bold", "0 0 0"),
  ].join("\n");
}

function renderContinuationHeader(name: string, page: number) {
  return [
    text(`${name} - resume continued`, LEFT, 748, 8.5, "bold", MUTED),
    text(`Page ${page}`, 552, 748, 8, "regular", MUTED),
    `q 0.86 0.88 0.91 RG 0.5 w ${LEFT} 736 m ${RIGHT} 736 l S Q`,
  ].join("\n");
}

function renderColumn(column: PageColumn) {
  const commands: string[] = [];
  let y = column.y;
  for (const line of column.lines) {
    y -= line.gapBefore ?? 0;
    if (isSection(line)) {
      commands.push(text(line.text.toUpperCase(), column.x, y, line.size, "bold", "0 0 0"));
      commands.push(`q 0 0 0 RG 1 w ${column.x} ${y - 4} m ${column.x + column.width} ${y - 4} l S Q`);
    } else if (line.bullet) {
      commands.push(text("-", column.x, y, line.size, "regular", INK));
      commands.push(text(line.text, column.x + 9, y, line.size, line.font, INK));
    } else {
      commands.push(text(line.text, column.x, y, line.size, line.font, line.color ?? (line.font === "bold" ? INK : MUTED)));
    }
    y -= line.leading;
  }
  return commands.join("\n");
}

function section(textValue: string): PdfLine {
  return { text: textValue, size: 10.5, font: "bold", leading: 15, gapBefore: 12 };
}

function roleLine(textValue: string, size = 9.4): PdfLine {
  return { text: textValue, size, font: "bold", leading: 12, gapBefore: 7 };
}

function bodyLine(textValue: string, size = 8.2, font: "regular" | "bold" = "regular", color?: string): PdfLine {
  return { text: textValue, size, font, color, leading: 10.5, gapBefore: 2 };
}

function bulletLines(textValue: string, width: number) {
  return wrap(textValue, width).map((line, index) => ({ ...bodyLine(line, 7.7), bullet: index === 0, gapBefore: index === 0 ? 2.2 : 0 }));
}

function wrapBody(textValue: string, width: number, bold = false) {
  return wrap(textValue, width).map((line, index) => ({ ...bodyLine(line, 7.8), font: bold ? "bold" as const : "regular" as const, gapBefore: index === 0 ? 2 : 0 }));
}

function skillLines(skills: string[]) {
  const lines: PdfLine[] = [];
  for (let index = 0; index < skills.length; index += 2) {
    lines.push(bodyLine([skills[index], skills[index + 1]].filter(Boolean).join("     "), 7.6));
  }
  return lines;
}

function isSection(line: PdfLine) {
  return line.size >= 10;
}

function wrap(value: string, width: number) {
  if (!value) return [];
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function text(value: string, x: number, y: number, size: number, font: "regular" | "bold", color: string) {
  return `BT ${color} rg /${font === "bold" ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(value)}) Tj ET`;
}

function escapePdfText(value: string) {
  return value
    .replace(/[–—‒―]/g, "-")
    .replace(/[''‚]/g, "'")
    .replace(/[""„]/g, '"')
    .replace(/[•·]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}
