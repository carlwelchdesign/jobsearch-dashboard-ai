import { parseResumeDocument, type ResumeDocument } from "@/lib/resumes/resume-document";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 18;
const RIGHT = 594;
const TOP = 752;
const BOTTOM = 42;
const EXPERIENCE_WIDTH = 374;
const EXPERIENCE_WRAP = 76;
const EXPERIENCE_BULLET_WRAP = 73;
const SIDEBAR_X = 398;
const SIDEBAR_WIDTH = RIGHT - SIDEBAR_X;
const SIDEBAR_WRAP = 36;
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
      ...(item.company ? [bodyLine(item.company, 7.8, "bold", BLUE)] : []),
      ...(item.dates ? [bodyLine(item.dates, 7.2)] : []),
      ...(item.skills.length ? wrapBody(`Skills: ${item.skills.join(", ")}`, EXPERIENCE_WRAP) : []),
      ...item.bullets.slice(0, 5).flatMap((bullet) => bulletLines(bullet, EXPERIENCE_BULLET_WRAP)),
    ]),
  ];
  const rightLines = [
    section("Summary"),
    ...document.summary.flatMap((line) => wrapBody(line, SIDEBAR_WRAP)),
    section("Education"),
    ...document.education.flatMap((line) => wrapBody(line, SIDEBAR_WRAP, true)),
    ...(document.certifications.length ? [section("Certifications"), ...document.certifications.flatMap((line) => wrapBody(line, SIDEBAR_WRAP, true))] : []),
    section("Skills"),
    ...skillLines(document.skills),
    section("Projects"),
    ...document.projects.slice(0, 4).flatMap((project) => [
      roleLine(project.name, 8.8),
      ...wrapBody(project.description, SIDEBAR_WRAP),
    ]),
  ];

  const pages: Array<{ left: PageColumn; right: PageColumn }> = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < leftLines.length || rightIndex < rightLines.length || pages.length === 0) {
    const top = pages.length === 0 ? 692 : 720;
    const left = nextColumn(leftLines, leftIndex, LEFT, top, EXPERIENCE_WIDTH, EXPERIENCE_WRAP);
    const right = nextColumn(rightLines, rightIndex, SIDEBAR_X, top, SIDEBAR_WIDTH, SIDEBAR_WRAP);
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

function renderHeader(document: ResumeDocument, hasProfileImage: boolean) {
  const initials = document.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CV";
  const contact = document.contactLine.split(/\s*\|\s*/).filter(Boolean).join("   ");
  const badge = hasProfileImage
    ? [
      `q ${circlePath(558, 710, 25)} W n 50 0 0 50 533 685 cm /ProfileImage Do Q`,
      `q ${BLUE} RG 1.2 w ${circlePath(558, 710, 25)} S Q`,
    ].join("\n")
    : [
      `q ${BLUE} rg ${circlePath(558, 710, 25)} f Q`,
      text(initials, 546, 704, 14.5, "bold", "0 0 0"),
    ].join("\n");
  return [
    text(document.name.toUpperCase(), LEFT, TOP, 21, "bold", "0 0 0"),
    text(document.headline, LEFT, TOP - 18, 9.5, "bold", BLUE),
    text(contact, LEFT, TOP - 36, 7.2, "regular", MUTED),
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
