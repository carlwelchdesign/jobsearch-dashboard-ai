import { parseResumeDocument, type ResumeDocument } from "@/lib/resumes/resume-document";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 24;
const RIGHT = 588;
const TOP = 752;
const BOTTOM = 42;
const COLUMN_GAP = 18;
const EXPERIENCE_WIDTH = 267.3;
const SIDEBAR_X = LEFT + EXPERIENCE_WIDTH + COLUMN_GAP;
const SIDEBAR_WIDTH = 194.4;
const BLUE = "0.02 0.46 0.93";
const INK = "0.05 0.06 0.08";
const MUTED = "0.30 0.34 0.40";
const CHIP_FILL = "0.95 0.96 0.97";
const DIVIDER = "0.86 0.88 0.91";
const BODY_SIZE = 7.35;
const BODY_LEADING = 9.5;
const SMALL_SIZE = 6.85;
const BULLET_INDENT = 10;
const CHIP_FONT_SIZE = 6.35;
const CHIP_HEIGHT = 9.2;
const CHIP_X_PADDING = 3;
const CHIP_GAP = 3.2;

type PdfLine = {
  text: string;
  size: number;
  font: "regular" | "bold";
  leading: number;
  gapBefore?: number;
  bullet?: boolean;
  color?: string;
  kind?: "section" | "role-separator" | "chip-row";
  chips?: string[];
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

export function createModernTwoColumnResumePdf(text: string, options: { profileImage?: ResumePdfImage | null } = {}): Uint8Array<ArrayBuffer> {
  const document = parseResumeDocument(text);
  const pages = layoutPages(document);
  const profileImage = pdfImage(options.profileImage);
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const imageObjectId = profileImage ? objects.length + 1 : null;
  if (profileImage) objects.push(profileImage.object);

  const pageObjectIds: number[] = [];
  for (const [pageIndex, page] of pages.entries()) {
    const pageObjId = objects.length + 1;
    const contentObjId = pageObjId + 1;
    pageObjectIds.push(pageObjId);
    const xObjects = imageObjectId ? ` /XObject << /ProfileImage ${imageObjectId} 0 R >>` : "";
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xObjects} >> /Contents ${contentObjId} 0 R >>`);
    const content = [
      "q 1 1 1 rg 0 0 612 792 re f Q",
      pageIndex === 0 ? renderHeader(document, Boolean(profileImage)) : renderContinuationHeader(document.name, pageIndex + 1),
      renderColumn(page.left),
      renderColumn(page.right),
    ].filter(Boolean).join("\n");
    objects.push(`<< /Length ${byteLength(content)} >>\nstream\n${content}\nendstream`);
  }

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  const chunks: string[] = ["%PDF-1.4\n"];
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(byteLength(chunks.join("")));
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  }
  const xrefOffset = byteLength(chunks.join(""));
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  for (const offset of offsets.slice(1)) chunks.push(`${offset.toString().padStart(10, "0")} 00000 n \n`);
  chunks.push(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const buffer = Buffer.from(chunks.join(""), "latin1");
  return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

function byteLength(value: string) {
  return Buffer.byteLength(value, "latin1");
}

function layoutPages(document: ResumeDocument) {
  const leftLines = [
    section("Experience"),
    ...document.experience.flatMap((item) => [
      roleLine(item.role ?? item.title),
      ...(item.company ? [bodyLine(item.company, 7.4, "bold", BLUE)] : []),
      ...(item.dates ? [bodyLine(item.dates, SMALL_SIZE)] : []),
      ...(item.skills.length ? wrapBody(`Skills: ${item.skills.join(", ")}`, EXPERIENCE_WIDTH, BODY_SIZE) : []),
      ...item.bullets.slice(0, 5).flatMap((bullet) => bulletLines(bullet, EXPERIENCE_WIDTH - BULLET_INDENT)),
      roleSeparator(),
    ]),
  ];
  const rightLines = [
    section("Summary"),
    ...document.summary.flatMap((line) => wrapBody(line, SIDEBAR_WIDTH, BODY_SIZE)),
    section("Education"),
    ...document.education.flatMap((line) => wrapBody(line, SIDEBAR_WIDTH, BODY_SIZE, true)),
    ...(document.certifications.length ? [section("Certifications"), ...document.certifications.flatMap((line) => wrapBody(line, SIDEBAR_WIDTH, BODY_SIZE, true))] : []),
    section("Skills"),
    ...skillChipRows(document.skills),
    section("Projects"),
    ...document.projects.slice(0, 4).flatMap((project) => [
      roleLine(project.name, 8.4),
      ...wrapBody(project.description, SIDEBAR_WIDTH, BODY_SIZE),
    ]),
  ];

  const pages: Array<{ left: PageColumn; right: PageColumn }> = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < leftLines.length || rightIndex < rightLines.length || pages.length === 0) {
    const top = pages.length === 0 ? 692 : 720;
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
    const nextY = cursorY - (line.gapBefore ?? 0) - line.leading;
    if (nextY < BOTTOM && selected.length) break;
    selected.push(line);
    cursorY = nextY;
    index += 1;
  }
  return { nextIndex: index, column: { lines: selected, x, y, width } };
}

function renderHeader(document: ResumeDocument, hasProfileImage: boolean) {
  const initials = document.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CV";
  const contact = document.contactLine.split(/\s*\|\s*/).filter(Boolean).join("   ");
  const badge = hasProfileImage
    ? [
      `q ${circlePath(556, 709, 24)} W n 48 0 0 48 532 685 cm /ProfileImage Do Q`,
      `q ${BLUE} RG 1.2 w ${circlePath(556, 709, 24)} S Q`,
    ].join("\n")
    : [
      `q ${BLUE} rg ${circlePath(556, 709, 24)} f Q`,
      text(initials, 545, 703, 14, "bold", "0 0 0"),
    ].join("\n");
  return [
    text(document.name.toUpperCase(), LEFT, TOP, 18.5, "bold", "0 0 0"),
    text(document.headline, LEFT, TOP - 16, 9.1, "bold", BLUE),
    text(contact, LEFT, TOP - 34, 6.9, "regular", MUTED),
    badge,
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
    } else if (line.kind === "role-separator") {
      commands.push(`q ${DIVIDER} RG 0.45 w ${column.x} ${y} m ${column.x + column.width} ${y} l S Q`);
    } else if (line.kind === "chip-row" && line.chips) {
      commands.push(...renderChipRow(line.chips, column.x, y));
    } else if (line.bullet) {
      commands.push(`q 0 0 0 rg ${circlePath(column.x + 3.2, y + 3.1, 1.25)} f Q`);
      commands.push(text(line.text, column.x + 10, y, line.size, line.font, INK));
    } else {
      commands.push(text(line.text, column.x, y, line.size, line.font, line.color ?? (line.font === "bold" ? INK : MUTED)));
    }
    y -= line.leading;
  }
  return commands.join("\n");
}

function section(textValue: string): PdfLine {
  return { text: textValue, size: 9.8, font: "bold", leading: 14, gapBefore: 10, kind: "section" };
}

function roleLine(textValue: string, size = 9.4): PdfLine {
  return { text: textValue, size, font: "bold", leading: 11, gapBefore: 7 };
}

function bodyLine(textValue: string, size = BODY_SIZE, font: "regular" | "bold" = "regular", color?: string): PdfLine {
  return { text: textValue, size, font, color, leading: BODY_LEADING, gapBefore: 2 };
}

function bulletLines(textValue: string, width: number) {
  return wrapPdfTextByWidth(textValue, width, BODY_SIZE, "regular").map((line, index) => ({ ...bodyLine(line, BODY_SIZE), bullet: index === 0, gapBefore: index === 0 ? 2.2 : 0 }));
}

function wrapBody(textValue: string, width: number, size = BODY_SIZE, bold = false) {
  const font = bold ? "bold" as const : "regular" as const;
  return wrapPdfTextByWidth(textValue, width, size, font).map((line, index) => ({ ...bodyLine(line, size), font, gapBefore: index === 0 ? 2 : 0 }));
}

function skillChipRows(skills: string[]) {
  const lines: PdfLine[] = [];
  let row: string[] = [];
  let rowWidth = 0;
  for (const skill of skills.slice(0, 28)) {
    const chipWidth = chipTextWidth(skill);
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

function renderChipRow(chips: string[], x: number, y: number) {
  const commands: string[] = [];
  let cursorX = x;
  for (const chip of chips) {
    const width = chipTextWidth(chip);
    commands.push(`q ${CHIP_FILL} rg ${roundedRectPath(cursorX, y - 2, width, CHIP_HEIGHT, 2)} f Q`);
    commands.push(text(chip, cursorX + CHIP_X_PADDING, y + 0.1, CHIP_FONT_SIZE, "bold", INK));
    cursorX += width + CHIP_GAP;
  }
  return commands;
}

function chipTextWidth(value: string) {
  return Math.max(16, estimatePdfTextWidth(value, CHIP_FONT_SIZE, "bold") + CHIP_X_PADDING * 2);
}

export function wrapPdfTextByWidth(value: string, maxWidth: number, size = BODY_SIZE, font: "regular" | "bold" = "regular") {
  if (!value) return [];
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (estimatePdfTextWidth(candidate, size, font) > maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function estimatePdfTextWidth(value: string, size: number, font: "regular" | "bold") {
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
}

function text(value: string, x: number, y: number, size: number, font: "regular" | "bold", color: string) {
  return `BT ${color} rg /${font === "bold" ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(value)}) Tj ET`;
}

function circlePath(cx: number, cy: number, r: number) {
  const c = r * 0.5522847498;
  return [
    `${cx + r} ${cy} m`,
    `${cx + r} ${cy + c} ${cx + c} ${cy + r} ${cx} ${cy + r} c`,
    `${cx - c} ${cy + r} ${cx - r} ${cy + c} ${cx - r} ${cy} c`,
    `${cx - r} ${cy - c} ${cx - c} ${cy - r} ${cx} ${cy - r} c`,
    `${cx + c} ${cy - r} ${cx + r} ${cy - c} ${cx + r} ${cy} c`,
    "h",
  ].join(" ");
}

function roundedRectPath(x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  const c = r * 0.5522847498;
  const right = x + width;
  const top = y + height;
  return [
    `${x + r} ${y} m`,
    `${right - r} ${y} l`,
    `${right - r + c} ${y} ${right} ${y + r - c} ${right} ${y + r} c`,
    `${right} ${top - r} l`,
    `${right} ${top - r + c} ${right - r + c} ${top} ${right - r} ${top} c`,
    `${x + r} ${top} l`,
    `${x + r - c} ${top} ${x} ${top - r + c} ${x} ${top - r} c`,
    `${x} ${y + r} l`,
    `${x} ${y + r - c} ${x + r - c} ${y} ${x + r} ${y} c`,
    "h",
  ].join(" ");
}

function pdfImage(image: ResumePdfImage | null | undefined) {
  if (!image || !/^image\/jpe?g$/i.test(image.mimeType)) return null;
  const dimensions = jpegDimensions(image.bytes);
  if (!dimensions) return null;
  const binary = Buffer.from(image.bytes).toString("latin1");
  return {
    object: `<< /Type /XObject /Subtype /Image /Width ${dimensions.width} /Height ${dimensions.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.byteLength} >>\nstream\n${binary}\nendstream`,
  };
}

function jpegDimensions(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
      };
    }
    offset += 2 + length;
  }
  return null;
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
