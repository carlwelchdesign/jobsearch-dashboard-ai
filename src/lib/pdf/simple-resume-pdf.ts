// ─── Design system ────────────────────────────────────────────────────────────
//
// Two typographic presets. All visual decisions (size, spacing, color, weight)
// live in the preset object. Nothing is hardcoded in the rendering functions.
//
//   "tschichold" — Jan Tschichold / editorial restraint. Hierarchy through
//                  proportion and spacing, not decoration. No color blocks,
//                  no accent bars. Designed to disappear into the content.
//
//   "swiss"      — Swiss technical grid. Tighter, more utilitarian. A single
//                  restrained accent color on section rules only.
//
// Default: "tschichold"

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

type BulletMarker = "dash" | "square";
export type PdfPreset = "tschichold" | "swiss";

type DesignPreset = {
  // Page grid
  left: number;
  right: number;
  bodyTopP1: number;  // first-page body start y
  bodyTopPN: number;  // subsequent pages body start y
  bottom: number;

  // Header — name + contact, no background fill
  nameY: number;
  nameSize: number;
  nameTracking: number;
  contactY: number;
  contactSize: number;
  contactColorCmd: string;
  dividerY: number;
  dividerWeight: number;
  dividerColorCmd: string; // stroke command
  urlColorCmd: string;     // fill color for URL parts in contact line

  // Section labels
  sectionSize: number;
  sectionTracking: number;
  sectionGapBefore: number;
  sectionLeading: number;  // absorbs text + gap + rule + space below
  sectionRuleWeight: number;
  sectionRuleColorCmd: string;
  sectionRuleOffset: number; // pts below text baseline

  // Roles
  roleSize: number;
  roleGapBefore: number;
  roleLeading: number;
  dateSize: number;
  dateColorCmd: string;

  // Bullets
  bulletSize: number;
  bulletLeading: number;
  bulletGapBefore: number;
  bulletIndent: number;
  bulletMarker: BulletMarker;

  // Body
  bodySize: number;
  bodyLeading: number;
  bodyGapBefore: number;

  // Blank lines
  spaceLeading: number;

  // Wrap widths (character count — used for line-breaking)
  wrapSection: number;
  wrapRole: number;
  wrapBullet: number;
  wrapBody: number;
};

const TSCHICHOLD: DesignPreset = {
  left: 72,
  right: 540,
  bodyTopP1: 694,  // low enough to clear a two-line contact header
  bodyTopPN: 730,
  bottom: 64,

  nameY: 754,
  nameSize: 19,
  nameTracking: 0,
  contactY: 735,
  contactSize: 8.5,
  contactColorCmd: "0.42 0.42 0.42 rg",
  dividerY: 723,
  dividerWeight: 0.4,
  dividerColorCmd: "0.58 0.58 0.58 RG",
  urlColorCmd: "0.20 0.20 0.20 rg",

  sectionSize: 8.5,
  sectionTracking: 1.8,
  sectionGapBefore: 26,
  sectionLeading: 20,
  sectionRuleWeight: 0.35,
  sectionRuleColorCmd: "0.62 0.62 0.62 RG",
  sectionRuleOffset: 5,

  roleSize: 10,
  roleGapBefore: 12,
  roleLeading: 14,
  dateSize: 9,
  dateColorCmd: "0.42 0.42 0.42 rg",

  bulletSize: 9.5,
  bulletLeading: 13,
  bulletGapBefore: 2,
  bulletIndent: 12,
  bulletMarker: "dash",

  bodySize: 9.5,
  bodyLeading: 14,
  bodyGapBefore: 3,

  spaceLeading: 4,

  wrapSection: 84,
  wrapRole: 68,
  wrapBullet: 82,
  wrapBody: 87,
};

const SWISS: DesignPreset = {
  left: 68,
  right: 544,
  bodyTopP1: 692,
  bodyTopPN: 728,
  bottom: 60,

  nameY: 752,
  nameSize: 17,
  nameTracking: 0.3,
  contactY: 733,
  contactSize: 8,
  contactColorCmd: "0.35 0.35 0.35 rg",
  dividerY: 721,
  dividerWeight: 0.5,
  dividerColorCmd: "0.00 0.47 0.44 RG", // single teal line
  urlColorCmd: "0.00 0.47 0.44 rg",     // teal accent for URL text

  sectionSize: 8,
  sectionTracking: 1.5,
  sectionGapBefore: 22,
  sectionLeading: 18,
  sectionRuleWeight: 0.5,
  sectionRuleColorCmd: "0.00 0.47 0.44 RG", // teal — only color in body
  sectionRuleOffset: 5,

  roleSize: 9.5,
  roleGapBefore: 10,
  roleLeading: 13,
  dateSize: 8.5,
  dateColorCmd: "0.35 0.35 0.35 rg",

  bulletSize: 9,
  bulletLeading: 12.5,
  bulletGapBefore: 2,
  bulletIndent: 13,
  bulletMarker: "square",

  bodySize: 9,
  bodyLeading: 13,
  bodyGapBefore: 3,

  spaceLeading: 4,

  wrapSection: 86,
  wrapRole: 72,
  wrapBullet: 84,
  wrapBody: 90,
};

const PRESETS: Record<PdfPreset, DesignPreset> = { tschichold: TSCHICHOLD, swiss: SWISS };

// ─── Line types ───────────────────────────────────────────────────────────────

type LineKind = "section" | "role" | "bullet" | "body" | "space";

type PdfLine = {
  text: string;
  rightText?: string;    // right-aligned date on role lines
  kind: LineKind;
  size: number;
  font: "regular" | "bold";
  leading: number;
  gapBefore: number;
  xOffset: number;
  continuation?: boolean; // wrapped lines 2+ of a bullet — no marker drawn
};

type UrlAnnotation = {
  uri: string;
  rect: [number, number, number, number]; // x1 y1 x2 y2 in PDF coordinates
};

type StyleDef = {
  size: number;
  font: "regular" | "bold";
  leading: number;
  gapBefore: number;
  xOffset: number;
  width: number;
};

function makeStyles(p: DesignPreset): Record<LineKind, StyleDef> {
  return {
    section: { size: p.sectionSize, font: "bold",    leading: p.sectionLeading, gapBefore: p.sectionGapBefore, xOffset: 0,         width: p.wrapSection },
    role:    { size: p.roleSize,    font: "bold",    leading: p.roleLeading,    gapBefore: p.roleGapBefore,    xOffset: 0,         width: p.wrapRole    },
    bullet:  { size: p.bulletSize,  font: "regular", leading: p.bulletLeading,  gapBefore: p.bulletGapBefore,  xOffset: p.bulletIndent, width: p.wrapBullet  },
    body:    { size: p.bodySize,    font: "regular", leading: p.bodyLeading,    gapBefore: p.bodyGapBefore,    xOffset: 0,         width: p.wrapBody    },
    space:   { size: 0,             font: "regular", leading: p.spaceLeading,   gapBefore: 0,                  xOffset: 0,         width: 1             },
  };
}

type Preprocessed = { name: string; contactLine: string; bodyText: string };

// ─── Entry point ──────────────────────────────────────────────────────────────

export function createSimpleTextPdf(text: string, presetName: PdfPreset = "tschichold"): Buffer {
  const p = PRESETS[presetName];
  const styles = makeStyles(p);

  const { name, contactLine, bodyText } = preprocess(text);
  const bodyLines = toPdfLines(bodyText, styles);
  const pages = paginate(bodyLines, p);

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(""); // Pages placeholder

  const fontRegId = 3;
  const fontBoldId = 4;
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const pageObjectIds: number[] = [];

  const { content: headerContent, annotations: headerAnnotations } = renderHeader(name, contactLine, p);

  for (let pg = 0; pg < pages.length; pg++) {
    const pageObjId = objects.length + 1;
    const contentObjId = pageObjId + 1;
    const pageAnnotations = pg === 0 ? headerAnnotations : [];
    const annotStartId = contentObjId + 1;
    const annotIds = pageAnnotations.map((_, i) => annotStartId + i);
    pageObjectIds.push(pageObjId);

    const annotsEntry = annotIds.length > 0
      ? ` /Annots [${annotIds.map((id) => `${id} 0 R`).join(" ")}]`
      : "";
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegId} 0 R /F2 ${fontBoldId} 0 R >> >>${annotsEntry} /Contents ${contentObjId} 0 R >>`,
    );
    const parts: string[] = [];
    if (pg === 0) parts.push(headerContent);
    parts.push(renderBodyPage(pages[pg], pg === 0 ? p.bodyTopP1 : p.bodyTopPN, p));
    const content = parts.join("\n");
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);

    for (const ann of pageAnnotations) {
      objects.push(
        `<< /Type /Annot /Subtype /Link /Rect [${ann.rect.map((v) => v.toFixed(2)).join(" ")}] /Border [0 0 0] /A << /Type /Action /S /URI /URI (${ann.uri}) >> >>`,
      );
    }
  }

  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`;

  const chunks: string[] = ["%PDF-1.4\n"];
  const offsets = [0];
  for (const [i, obj] of objects.entries()) {
    offsets.push(Buffer.byteLength(chunks.join("")));
    chunks.push(`${i + 1} 0 obj\n${obj}\nendobj\n`);
  }

  const xrefOffset = Buffer.byteLength(chunks.join(""));
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  for (const off of offsets.slice(1)) chunks.push(`${off.toString().padStart(10, "0")} 00000 n \n`);
  chunks.push(`trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.from(chunks.join(""), "latin1");
}

// ─── Pre-processing ───────────────────────────────────────────────────────────

function preprocess(text: string): Preprocessed {
  const lines = text.replace(/\r/g, "").split("\n");
  const nameIdx = lines.findIndex((l) => l.trim());
  if (nameIdx === -1) return { name: "", contactLine: "", bodyText: text };

  const name = lines[nameIdx].trim().replace(/^#+\s*/, "");
  const contactParts: string[] = [];
  let bodyStart = nameIdx + 1;

  for (let j = nameIdx + 1; j < Math.min(nameIdx + 6, lines.length); j++) {
    const trimmed = lines[j].trim();
    if (!trimmed) { bodyStart = j + 1; continue; }
    if (/@|https?:\/\/|\|/.test(trimmed)) {
      contactParts.push(
        ...trimmed.split(/\s*\|\s*/).map((p) => normalizeContactPart(p.trim())).filter(Boolean),
      );
      bodyStart = j + 1;
    } else {
      bodyStart = j;
      break;
    }
  }

  return { name, contactLine: contactParts.join("  |  "), bodyText: lines.slice(bodyStart).join("\n") };
}

// Strip AI-added labels ("Email:", "Phone:", "LinkedIn:", etc.) and shorten URLs
// to their meaningful path. "https://www.linkedin.com/in/carl/" → "linkedin.com/in/carl"
function normalizeContactPart(part: string): string {
  const labelStripped = part.replace(/^(email|phone|tel|mobile|cell|linkedin|github|location|address|website|url|portfolio)\s*:\s*/i, "").trim();
  if (/^https?:\/\//i.test(labelStripped)) {
    try {
      const u = new URL(labelStripped);
      const host = u.hostname.replace(/^www\./, "");
      const path = u.pathname.replace(/\/$/, "");
      return path && path !== "/" ? `${host}${path}` : host;
    } catch {
      return labelStripped;
    }
  }
  return labelStripped;
}

// ─── Line classification ──────────────────────────────────────────────────────

function toPdfLines(bodyText: string, styles: Record<LineKind, StyleDef>): PdfLine[] {
  const output: PdfLine[] = [];

  for (const rawLine of bodyText.replace(/\r/g, "").split("\n")) {
    const trimmed = rawLine.trim().replace(/^#+\s*/, "");
    const kind = classifyLine(trimmed);
    const style = styles[kind];

    if (kind === "space") {
      output.push({ text: "", kind, ...style });
      continue;
    }

    if (kind === "role") {
      const { main, date } = parseRoleLine(trimmed);
      for (const [i, seg] of wrapLine(main, style.width).entries()) {
        output.push({ text: seg, rightText: i === 0 ? date : undefined, kind, ...style, gapBefore: i === 0 ? style.gapBefore : 0 });
      }
      continue;
    }

    const content = kind === "bullet" ? trimmed.replace(/^[-]\s*/, "") : trimmed;
    for (const [i, seg] of wrapLine(content, style.width).entries()) {
      output.push({ text: seg, kind, ...style, gapBefore: i === 0 ? style.gapBefore : 0, continuation: i > 0 });
    }
  }

  return output;
}

function classifyLine(line: string): LineKind {
  if (!line) return "space";
  if (/^(Summary|Skills|Professional Experience|Projects|Education|Certifications|Experience|Cover Letter)$/i.test(line)) return "section";
  if (/^- /.test(line)) return "bullet";
  if (/^[A-Z][A-Za-z0-9 .&,/-]+ - .+/.test(line)) return "role";
  return "body";
}

function parseRoleLine(text: string): { main: string; date?: string } {
  const idx = text.lastIndexOf(" | ");
  return idx !== -1 ? { main: text.slice(0, idx).trim(), date: text.slice(idx + 3).trim() } : { main: text };
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function paginate(lines: PdfLine[], p: DesignPreset): PdfLine[][] {
  const pages: PdfLine[][] = [[]];
  let y = p.bodyTopP1;

  for (const line of lines) {
    y -= line.gapBefore;
    if (y < p.bottom) {
      pages.push([]);
      y = p.bodyTopPN;
    }
    pages[pages.length - 1].push(line);
    y -= line.leading;
  }

  if (!pages[0].length) pages[0].push({ text: "", kind: "space", size: 0, font: "regular", leading: 4, gapBefore: 0, xOffset: 0 });
  return pages;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

// Header: name left-aligned; personal contact (email, phone) left-aligned;
// web presence (LinkedIn, GitHub) right-aligned — classic bipartite layout.
// URL parts carry PDF /Annot Link objects for clickability and a thin underline
// as a visual affordance. No background fills; hierarchy through typography alone.
function renderHeader(
  name: string,
  contactLine: string,
  p: DesignPreset,
): { content: string; annotations: UrlAnnotation[] } {
  const cmds: string[] = [];
  const annotations: UrlAnnotation[] = [];

  cmds.push("BT");
  if (name) {
    cmds.push("0 0 0 rg");
    cmds.push(`/F2 ${p.nameSize} Tf`);
    cmds.push(`${p.nameTracking} Tc`);
    cmds.push(`1 0 0 1 ${p.left} ${p.nameY} Tm`);
    cmds.push(`(${escapePdfText(name)}) Tj`);
  }
  cmds.push("ET");

  const contactParts = contactLine ? contactLine.split("  |  ") : [];
  const leftParts = contactParts.filter((pt) => !isWebUrl(pt));  // email, phone
  const rightParts = contactParts.filter((pt) => isWebUrl(pt));  // LinkedIn, GitHub
  const sep = "  |  ";
  const contactY = p.contactY;

  function renderGroup(parts: string[], startX: number): void {
    if (!parts.length) return;
    cmds.push("BT");
    cmds.push(p.contactColorCmd);
    cmds.push(`/F1 ${p.contactSize} Tf`);
    cmds.push("0 Tc");
    let x = startX;
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        cmds.push(`1 0 0 1 ${x.toFixed(2)} ${contactY} Tm`);
        cmds.push(`(${escapePdfText(sep)}) Tj`);
        x += textWidth(sep, p.contactSize);
      }
      const part = parts[i];
      const pw = textWidth(part, p.contactSize);
      const uri = displayTextToUri(part);
      if (uri) cmds.push(p.urlColorCmd);
      cmds.push(`1 0 0 1 ${x.toFixed(2)} ${contactY} Tm`);
      cmds.push(`(${escapePdfText(part)}) Tj`);
      if (uri) {
        cmds.push(p.contactColorCmd);
        annotations.push({ uri, rect: [x, contactY - 2, x + pw, contactY + p.contactSize] });
      }
      x += pw;
    }
    cmds.push("ET");
  }

  renderGroup(leftParts, p.left);

  if (rightParts.length > 0) {
    let totalW = 0;
    for (let i = 0; i < rightParts.length; i++) {
      if (i > 0) totalW += textWidth(sep, p.contactSize);
      totalW += textWidth(rightParts[i], p.contactSize);
    }
    renderGroup(rightParts, p.right - totalW);
  }

  // Thin underlines beneath URL parts as visual affordance
  for (const ann of annotations) {
    const uly = (ann.rect[1] + 1).toFixed(2);
    cmds.push(
      `q 0.55 0.55 0.55 RG 0.3 w ${ann.rect[0].toFixed(2)} ${uly} m ${ann.rect[2].toFixed(2)} ${uly} l S Q`,
    );
  }

  const dividerY = contactY - 11;
  cmds.push(
    `q ${p.dividerColorCmd} ${p.dividerWeight} w ${p.left} ${dividerY} m ${p.right} ${dividerY} l S Q`,
  );

  return { content: cmds.join("\n"), annotations };
}

function renderBodyPage(lines: PdfLine[], startY: number, p: DesignPreset): string {
  let y = startY;
  const cmds: string[] = [];
  let inText = false;

  const endText = () => { if (inText) { cmds.push("ET"); inText = false; } };
  const beginText = () => { if (!inText) { cmds.push("BT"); inText = true; } };

  for (const line of lines) {
    y -= line.gapBefore;

    if (line.kind === "space") { y -= line.leading; continue; }

    if (line.kind === "section") {
      beginText();
      cmds.push(`${p.sectionTracking} Tc`);
      cmds.push(`0 0 0 rg`);
      cmds.push(`/F2 ${line.size} Tf`);
      cmds.push(`1 0 0 1 ${p.left} ${y} Tm`);
      cmds.push(`(${escapePdfText(line.text.toUpperCase())}) Tj`);
      endText();
      // Thin rule below label — structural marker, not decoration
      const ry = y - p.sectionRuleOffset;
      cmds.push(`q ${p.sectionRuleColorCmd} ${p.sectionRuleWeight} w ${p.left} ${ry} m ${p.right} ${ry} l S Q`);
      y -= line.leading;
      continue;
    }

    if (line.kind === "bullet") {
      if (p.bulletMarker === "square" && !line.continuation) {
        endText();
        // Small filled square — geometric marker for Swiss preset
        cmds.push(`q 0 0 0 rg ${p.left} ${y + 2.5} 3 3 re f Q`);
      }
      beginText();
      cmds.push(`0 Tc`);
      cmds.push(`0 0 0 rg`);
      cmds.push(`/F1 ${line.size} Tf`);

      if (p.bulletMarker === "dash" && !line.continuation) {
        // En-dash marker inline, then text at indent
        cmds.push(`1 0 0 1 ${p.left} ${y} Tm`);
        cmds.push(`(-) Tj`);
      }
      cmds.push(`1 0 0 1 ${p.left + line.xOffset} ${y} Tm`);
      cmds.push(`(${escapePdfText(line.text)}) Tj`);
      y -= line.leading;
      continue;
    }

    // role + body
    beginText();
    cmds.push(`0 Tc`);

    if (line.rightText) {
      // Role: company/title left-aligned bold, date right-aligned muted
      cmds.push(`0 0 0 rg`);
      cmds.push(`/F2 ${line.size} Tf`);
      cmds.push(`1 0 0 1 ${p.left} ${y} Tm`);
      cmds.push(`(${escapePdfText(line.text)}) Tj`);

      const dateW = line.rightText.length * p.dateSize * 0.50;
      cmds.push(p.dateColorCmd);
      cmds.push(`/F1 ${p.dateSize} Tf`);
      cmds.push(`1 0 0 1 ${p.right - dateW} ${y} Tm`);
      cmds.push(`(${escapePdfText(line.rightText)}) Tj`);
    } else {
      cmds.push(`0 0 0 rg`);
      cmds.push(`/${line.font === "bold" ? "F2" : "F1"} ${line.size} Tf`);
      cmds.push(`1 0 0 1 ${p.left + line.xOffset} ${y} Tm`);
      cmds.push(`(${escapePdfText(line.text)}) Tj`);
    }

    y -= line.leading;
  }

  endText();
  return cmds.join("\n");
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function wrapLine(line: string, width: number): string[] {
  if (!line) return [""];
  const words = line.split(/\s+/);
  const result: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width) { if (current) result.push(current); current = word; }
    else { current = candidate; }
  }
  if (current) result.push(current);
  return result;
}

// Approximate Helvetica advance widths — used to right-align the web presence group
// and to compute URL annotation rects. Pixel-perfect accuracy is not required.
function charAdvance(ch: string, fontSize: number): number {
  const specific: Record<string, number> = {
    " ": 0.28, ".": 0.28, ",": 0.28, ":": 0.28, ";": 0.28,
    "|": 0.26, "/": 0.30, "-": 0.33, "@": 0.94, "_": 0.56,
    "!": 0.28, "(": 0.33, ")": 0.33, "+": 0.56,
  };
  if (specific[ch] !== undefined) return specific[ch] * fontSize;
  if (/[0-9]/.test(ch)) return 0.56 * fontSize;
  if (/[MWQG]/.test(ch)) return 0.72 * fontSize;
  if (/[A-Z]/.test(ch)) return 0.65 * fontSize;
  return 0.54 * fontSize;
}

function textWidth(s: string, fontSize: number): number {
  let w = 0;
  for (const ch of s) w += charAdvance(ch, fontSize);
  return w;
}

function isWebUrl(part: string): boolean {
  if (part.includes("@")) return false;
  return /^[a-z0-9-]+\.[a-z]{2,}/i.test(part);
}

function displayTextToUri(part: string): string | null {
  if (part.includes("@")) return `mailto:${part}`;
  if (/^linkedin\.com/i.test(part)) return `https://www.${part}`;
  if (/^[a-z0-9-]+\.[a-z]{2,}/i.test(part)) return `https://${part}`;
  return null;
}

// Transliterate multi-byte Unicode to ASCII before writing to a Latin-1 PDF stream.
// Standard Type1 fonts use ISOLatin1Encoding — raw UTF-8 sequences for em-dashes,
// curly quotes, and similar characters corrupt to sequences like â€" in output.
function escapePdfText(value: string): string {
  const map: Array<[RegExp, string]> = [
    [/[–—‒―]/g, "-"],
    [/[''‚]/g, "'"],
    [/[""„]/g, '"'],
    [/[•·]/g, "-"],
    [/…/g, "..."],
    [/ /g, " "],
    [/™/g, "TM"],
    [/®/g, "(R)"],
    [/©/g, "(C)"],
    [/[àáâãäå]/g, "a"],
    [/[èéêë]/g, "e"],
    [/[ìíîï]/g, "i"],
    [/[òóôõö]/g, "o"],
    [/[ùúûü]/g, "u"],
    [/[ÀÁÂÃÄÅ]/g, "A"],
    [/[ÈÉÊË]/g, "E"],
    [/[ÌÍÎÏ]/g, "I"],
    [/[ÒÓÔÕÖ]/g, "O"],
    [/[ÙÚÛÜ]/g, "U"],
    [/ñ/g, "n"],
    [/ç/g, "c"],
    [/ß/g, "ss"],
  ];
  let s = value;
  for (const [pattern, replacement] of map) s = s.replace(pattern, replacement);
  s = s.replace(/[^\x00-\x7F]/g, "");
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
