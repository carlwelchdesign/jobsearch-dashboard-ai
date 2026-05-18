import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

const allowedTags = new Set(["p", "br", "strong", "b", "em", "i", "ul", "ol", "li", "h1", "h2", "h3", "h4", "a"]);
const denseEmojiBulletRegex = /\s+([👶🩺🏝📈💸🔑🤝🏆🌎])\s+/gu;

export function JobDescription({ description }: { description: string }) {
  const html = formatJobDescription(description);

  return (
    <Box
      sx={{
        color: "text.secondary",
        fontSize: 15,
        lineHeight: 1.7,
        maxWidth: 900,
        "& h1, & h2, & h3, & h4": {
          color: "text.primary",
          fontWeight: 850,
          lineHeight: 1.25,
          mt: 2.5,
          mb: 1,
        },
        "& h1": { fontSize: 24 },
        "& h2": { fontSize: 21 },
        "& h3": { fontSize: 18 },
        "& p": { my: 1.2 },
        "& ul, & ol": { pl: 3, my: 1.25 },
        "& li": { mb: 0.75 },
        "& strong, & b": { color: "text.primary", fontWeight: 800 },
        "& a": { color: "primary.main", overflowWrap: "anywhere" },
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function formatJobDescription(description: string) {
  const decoded = decodeHtmlEntitiesDeep(description);
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(decoded);
  const html = looksLikeHtml ? decoded : textToHtml(decoded);
  const sanitized = sanitizeHtml(html);
  return sanitized.trim() || "<p>No description available.</p>";
}

function textToHtml(value: string) {
  const blocks = structurePlainText(value)
    .split(/\n{2,}/)
    .flatMap((paragraph) => {
      const next = paragraph.trim();
      return next ? [next] : [];
    });

  return blocks.map((block) => {
    const lines = block.split("\n").flatMap((line) => {
      const next = line.trim();
      return next ? [next] : [];
    });
    if (lines.length === 0) return "";
    if (lines.every((line) => /^[-*•]\s+/.test(line))) {
      return `<ul>${lines.map((line) => `<li>${linkifyEscapedText(escapeHtml(line.replace(/^[-*•]\s+/, "")))}</li>`).join("")}</ul>`;
    }

    if (lines.length === 1 && isPlainTextHeading(lines[0])) {
      return `<h3>${escapeHtml(stripHeadingColon(lines[0]))}</h3>`;
    }

    return `<p>${linkifyEscapedText(escapeHtml(lines.join("\n")).replace(/\n/g, "<br>"))}</p>`;
  }).join("");
}

function structurePlainText(value: string) {
  let text = value.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();

  if (isDensePlainText(text)) {
    text = text.replace(/\s+-\s+/g, "\n- ");
    for (const headingRegex of denseTextHeadingRegexes) {
      text = text.replace(headingRegex, "\n\n$1\n\n");
    }
    text = text.replace(denseEmojiBulletRegex, "\n- $1 ");
  }

  const lines = text.split("\n").map((line) => line.trim());
  return lines
    .flatMap((line, index) => {
      const nextLine = lines[index + 1]?.trim();
      return line && nextLine && isPlainTextHeading(line) ? [line, ""] : [line];
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function isDensePlainText(value: string) {
  return value.length > 1200 && (value.match(/\n/g) ?? []).length < 8;
}

const denseTextHeadings = [
  "About 1Password",
  "What we're looking for:",
  "Bonus points for:",
  "What you can expect:",
  "USA-based roles only:",
  "Canada-based roles only:",
  "What we offer",
  "Health and wellbeing",
  "Growth and future",
  "Community",
  "You belong here.",
  "Our approach to remote work",
  "How we work with AI",
  "About DualEntry",
  "Why This Role Matters Now",
  "Where you'll create impact",
  "What sets you up for success",
  "Nice to have",
  "Benefits",
];
const denseTextHeadingRegexes = denseTextHeadings.map((heading) => new RegExp(`\\s+(${escapeRegExp(heading)})(?=\\s|$)`, "gi"));

function isPlainTextHeading(line: string) {
  const clean = stripHeadingColon(line);
  if (clean.length < 3 || clean.length > 80) return false;
  if (/^https?:\/\//i.test(clean) || /[.!?]$/.test(clean)) return false;
  if (denseTextHeadings.some((heading) => stripHeadingColon(heading).toLowerCase() === clean.toLowerCase())) return true;
  return /^(about|what|why|where|how|benefits|requirements|responsibilities|qualifications|nice to have|you belong here)/i.test(clean);
}

function stripHeadingColon(value: string) {
  return value.replace(/:\s*$/, "");
}

function linkifyEscapedText(value: string) {
  return value.replace(/\bhttps?:\/\/[^\s<]+/g, (rawUrl) => {
    const trailing = rawUrl.match(/[).,;:]+$/)?.[0] ?? "";
    const url = trailing ? rawUrl.slice(0, -trailing.length) : rawUrl;
    return `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>${trailing}`;
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeHtml(value: string) {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\s*([a-z0-9-]+)([^>]*)>/gi, (_match, rawTag: string, rawAttrs: string) => {
      const tag = rawTag.toLowerCase();
      if (!allowedTags.has(tag)) return "";
      if (tag === "a") {
        const href = String(rawAttrs).match(/\shref=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
        const url = sanitizeHref(href?.[1] ?? href?.[2] ?? href?.[3] ?? "");
        return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">` : "<a>";
      }
      return `<${tag}>`;
    })
    .replace(/<\s*\/\s*([a-z0-9-]+)\s*>/gi, (_match, rawTag: string) => {
      const tag = rawTag.toLowerCase();
      return allowedTags.has(tag) ? `</${tag}>` : "";
    });
}

function sanitizeHref(value: string) {
  const trimmed = decodeHtmlEntities(value).trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  return "";
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"',
    ndash: "-",
    mdash: "-",
    bull: "•",
  };

  return value
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code.startsWith("#x")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
      if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
      return named[code.toLowerCase()] ?? entity;
    })
    .replace(/\u00a0/g, " ");
}

function decodeHtmlEntitiesDeep(value: string) {
  let current = value;
  for (let i = 0; i < 4; i += 1) {
    const next = decodeHtmlEntities(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[char];
  });
}
