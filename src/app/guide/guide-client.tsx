'use client';

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CelebrationIcon from '@mui/icons-material/Celebration';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { PageHeader } from '@/components/ui/page-header';

// ─── Types ────────────────────────────────────────────────────────────────────

type TocEntry = { id: string; text: string; level: number };

interface Section {
  id: string;
  title: string;
  body: string;
  isExternal: boolean;
}

interface SubSection {
  id: string;
  title: string;
  body: string;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function extractToc(markdown: string): TocEntry[] {
  const lines = markdown.split('\n');
  const entries: TocEntry[] = [];
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (!match) continue;
    const level = match[1].length;
    const text = match[2].replace(/\*\*/g, '').replace(/`/g, '').trim();
    if (level === 1 && entries.length === 0) continue;
    if (text === 'Table of Contents') continue;
    entries.push({ id: slugify(text), text, level });
  }
  return entries;
}

function parsePartNumber(text: string): string | null {
  const match = text.match(/^Part\s+(\d+)\s*[—\-]/);
  return match ? match[1].padStart(2, '0') : null;
}

/** Recursively extract plain text from React children */
function childrenToText(children: React.ReactNode): string {
  if (children == null) return '';
  if (typeof children === 'string') return children;
  if (typeof children === 'number' || typeof children === 'boolean') return String(children);
  if (Array.isArray(children)) return children.map(childrenToText).join('');
  if (typeof children === 'object' && 'props' in (children as object)) {
    const el = children as React.ReactElement<{ children?: React.ReactNode }>;
    return childrenToText(el.props.children);
  }
  return '';
}

/** Split markdown into top-level sections at ## boundaries */
function splitSections(markdown: string): Section[] {
  return markdown
    .split(/\n(?=## )/)
    .filter((chunk) => chunk.trimStart().startsWith('## '))
    .map((chunk) => {
      const lines = chunk.split('\n');
      const title = lines[0].replace(/^## /, '').trim();
      const body = lines
        .slice(1)
        .join('\n')
        .replace(/^\s*---\s*\n+/, '') // strip leading hr
        .replace(/\n+\s*---\s*$/, '') // strip trailing hr
        .trim();
      const id = slugify(title.replace(/\*\*/g, '').replace(/`/g, ''));
      return {
        id,
        title,
        body,
        isExternal: id.startsWith('external-services'),
      };
    });
}

/** Split a section body at ### boundaries (used for External Services only) */
function splitSubSections(body: string): SubSection[] {
  return body
    .split(/\n(?=### )/)
    .filter((chunk) => chunk.trimStart().startsWith('### '))
    .map((chunk) => {
      const lines = chunk.split('\n');
      const title = lines[0].replace(/^### /, '').trim();
      const subBody = lines.slice(1).join('\n').trim();
      const id = slugify(title.replace(/\*\*/g, '').replace(/`/g, ''));
      return { id, title, body: subBody };
    });
}

/** Build maps: headingId → sectionId, headingId → subSectionId */
function buildHeadingMaps(sections: Section[]) {
  const headingToSection: Record<string, string> = {};
  const headingToSubSection: Record<string, string> = {};

  for (const sec of sections) {
    const headingRe = /^#{1,6}\s+(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = headingRe.exec(sec.body)) !== null) {
      const hId = slugify(m[1].replace(/\*\*/g, '').replace(/`/g, ''));
      if (!headingToSection[hId]) headingToSection[hId] = sec.id;
    }

    if (sec.isExternal) {
      const subs = splitSubSections(sec.body);
      for (const sub of subs) {
        headingToSubSection[sub.id] = sub.id;
        const deepRe = /^#{4,6}\s+(.+)$/gm;
        let d: RegExpExecArray | null;
        while ((d = deepRe.exec(sub.body)) !== null) {
          const dId = slugify(d[1].replace(/\*\*/g, '').replace(/`/g, ''));
          if (!headingToSubSection[dId]) headingToSubSection[dId] = sub.id;
        }
      }
    }
  }

  return { headingToSection, headingToSubSection };
}

// ─── Module-level open/close registries ──────────────────────────────────────
// Keyed by section/subsection ID. Stores setOpen(boolean) so callers can both
// expand and collapse. Each SectionBlock/SubSectionBlock registers on mount.

const expandRegistry: Record<string, (open: boolean) => void> = {};
const subExpandRegistry: Record<string, (open: boolean) => void> = {};
let headingToSectionMap: Record<string, string> = {};
let headingToSubSectionMap: Record<string, string> = {};

// ─── Completion callout ───────────────────────────────────────────────────────
// Rendered at the end of each numbered Part. Fires onComplete only when the
// callout is actually scrolled into the viewport (not just when expanded).

const CompletionCallout = memo(function CompletionCallout({
  partNum,
  children,
  onComplete,
}: {
  partNum: number;
  children: React.ReactNode;
  onComplete: (n: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onComplete(partNum);
      },
      // 60 % of the callout must be visible; offset for the sticky header
      { threshold: 0.6, rootMargin: '-80px 0px 0px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [partNum, onComplete]);

  // Shared ::before styles for both the crisp border and the blurred glow layer.
  // Uses a 99999 px element centred and rotated — identical to the CodePen technique.
  const beforeSx = {
    content: '""',
    position: 'absolute',
    zIndex: -2,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%) rotate(0deg)',
    width: '99999px',
    height: '99999px',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: '0 0',
    backgroundImage: 'conic-gradient(rgba(0,0,0,0), #1976ed, rgba(0,0,0,0) 25%)',
    animation: 'completionRotate 5s linear infinite',
  } as const;

  return (
    // Outer wrapper — mx:"20px" leaves 20 px on each side so the glow (blur ~8 px)
    // stays fully visible without being clipped by the parent container.
    <Box
      ref={ref}
      sx={{
        position: "relative",
        mb: 2.5,
        mx: "20px",
        // Define the shared keyframe once; Emotion injects it globally
        "@keyframes completionRotate": {
          "100%": { transform: "translate(-50%, -50%) rotate(1turn)" },
        },
      }}
    >
      {/* ── Glow layer: same gradient but blurred ──────────────────────────── */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          borderRadius: "12px",
          overflow: "hidden",
          // Tighter blur — matches the CodePen visual on a large element
          filter: "blur(8px)",
          zIndex: 0,
          "&::before": beforeSx,
        }}
      />

      {/* ── Border layer: crisp rotating line ──────────────────────────────── */}
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          borderRadius: "12px",
          overflow: "hidden",
          zIndex: 1,
          "&::before": beforeSx,
        }}
      />

      {/* ── Content: 3 px inset exposes the border strip all around ───────── */}
      <Box
        sx={{
          position: "relative",
          zIndex: 2,
          m: "3px",
          borderRadius: "9px",
          bgcolor: "background.paper",
          p: 2,
        }}
      >
        {/* Congratulations header */}
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
          <CelebrationIcon sx={{ color: '#f59e0b', fontSize: 22, flexShrink: 0 }} />
          <Typography
            sx={{
              fontWeight: 900,
              fontSize: 17,
              color: 'text.primary',
              letterSpacing: '-0.01em',
            }}
          >
            {`Congratulations! You completed Part ${partNum}.`}
          </Typography>
        </Stack>

        {/* Original callout content (sans marker) */}
        <Box sx={{ pl: 0.5, color: 'text.secondary', fontSize: '0.95rem', lineHeight: 1.75 }}>{children}</Box>
      </Box>
    </Box>
  );
});

// ─── Navigation helper ────────────────────────────────────────────────────────

const HEADER_OFFSET = 80;

function doScroll(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.pageYOffset - HEADER_OFFSET;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function navigate(id: string) {
  try {
    window.history.replaceState(null, '', `#${id}`);
  } catch {
    // ignore in sandboxed environments
  }

  let delay = 0;

  // If this id is a section itself, just expand it
  if (expandRegistry[id]) {
    expandRegistry[id](true);
    delay = 300;
  } else {
    // Expand the parent section if this heading is inside one
    const sectionId = headingToSectionMap[id];
    if (sectionId && expandRegistry[sectionId]) {
      expandRegistry[sectionId](true);
      delay = 300;
    }

    // Expand the parent sub-section (External Services only)
    const subId = headingToSubSectionMap[id];
    if (subId && subId !== id && subExpandRegistry[subId]) {
      setTimeout(() => subExpandRegistry[subId](true), 50);
      delay = Math.max(delay, 350);
    }
  }

  setTimeout(() => doScroll(id), delay);
}

// ─── Chapter Overview ─────────────────────────────────────────────────────────

function ChapterOverview({ entries }: { entries: TocEntry[] }) {
  const [open, setOpen] = useState(true);
  const chapters = entries.filter((e) => e.level === 2);

  return (
    <Card variant="outlined" sx={{ mb: 4, borderRadius: 2, overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2.5,
          py: 1.5,
          bgcolor: 'rgba(15, 118, 110, 0.05)',
          borderBottom: open ? '1px solid' : 'none',
          borderColor: 'divider',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <FormatListBulletedIcon fontSize="small" color="primary" />
          <Typography sx={{ fontWeight: 800, fontSize: 14 }}>Table of Contents</Typography>
          <Chip
            label={`${chapters.length} sections`}
            size="small"
            variant="outlined"
            color="primary"
            sx={{ fontSize: 11, height: 20 }}
          />
        </Stack>
        <IconButton size="small" aria-label={open ? 'Collapse' : 'Expand'}>
          {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={open}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
          }}
        >
          {chapters.map((entry) => {
            const partNum = parsePartNumber(entry.text);
            const title = entry.text
              .replace(/^Part\s+\d+\s*[—\-]\s*/, '')
              .replace(/^External Services Reference\s*[—\-]\s*/, 'Services Reference — ');
            return (
              <Box
                key={entry.id}
                component="button"
                type="button"
                onClick={() => navigate(entry.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2,
                  py: 1.25,
                  textAlign: 'left',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'rgba(15, 118, 110, 0.04)', color: 'primary.dark' },
                  transition: 'background-color 0.15s',
                  cursor: 'pointer',
                  color: 'text.primary',
                  width: '100%',
                }}
              >
                <Box
                  sx={{
                    flexShrink: 0,
                    width: 28,
                    height: 28,
                    borderRadius: 1,
                    bgcolor: partNum ? 'primary.main' : 'rgba(15, 118, 110, 0.12)',
                    color: partNum ? 'white' : 'primary.dark',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: partNum ? 11 : 13,
                    fontWeight: 900,
                    fontFamily: 'monospace',
                  }}
                >
                  {partNum ?? '★'}
                </Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{title}</Typography>
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Card>
  );
}

// ─── Full TOC Drawer ──────────────────────────────────────────────────────────

function TocDrawer({ entries, open, onClose }: { entries: TocEntry[]; open: boolean; onClose: () => void }) {
  return (
    <Drawer anchor="left" open={open} onClose={onClose} disableScrollLock>
      <Box sx={{ width: 320, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <MenuBookOutlinedIcon fontSize="small" color="primary" />
            <Typography sx={{ fontWeight: 800, fontSize: 14 }}>Contents</Typography>
          </Stack>
          <IconButton size="small" onClick={onClose} aria-label="Close contents">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
        <List dense sx={{ overflowY: 'auto', flex: 1, py: 1 }}>
          {entries.map((entry) => {
            const partNum = entry.level === 2 ? parsePartNumber(entry.text) : null;
            return (
              <ListItemButton
                key={entry.id}
                onClick={() => {
                  navigate(entry.id);
                  onClose();
                }}
                sx={{
                  pl: entry.level === 2 ? 1.5 : entry.level === 3 ? 3.5 : 5,
                  py: 0.4,
                  borderRadius: 1,
                  mx: 0.5,
                  gap: 1.5,
                  '&:hover': { bgcolor: 'rgba(15, 118, 110, 0.06)', color: 'primary.dark' },
                }}
              >
                {partNum && (
                  <Box
                    sx={{
                      flexShrink: 0,
                      width: 22,
                      height: 22,
                      borderRadius: 0.75,
                      bgcolor: 'primary.main',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 900,
                      fontFamily: 'monospace',
                    }}
                  >
                    {partNum}
                  </Box>
                )}
                <ListItemText
                  primary={entry.text}
                  slotProps={{
                    primary: {
                      sx: {
                        fontSize: entry.level === 2 ? 13 : entry.level === 3 ? 12 : 11.5,
                        fontWeight: entry.level === 2 ? 700 : 400,
                        color: entry.level === 2 ? 'text.primary' : 'text.secondary',
                        lineHeight: 1.35,
                      },
                    },
                  }}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Box>
    </Drawer>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function ClickToCopyCode({ text, children }: { text: string; children: React.ReactNode }) {
  const [state, setState] = useState<'idle' | 'copied' | 'fading'>('idle');

  function handleClick() {
    navigator.clipboard.writeText(text).then(() => {
      setState('copied');
      setTimeout(() => setState('fading'), 1200);
      setTimeout(() => setState('idle'), 1800);
    });
  }

  const tooltipTitle =
    state === 'idle' ? 'Click to copy' : state === 'copied' ? 'Copied!' : '';

  return (
    <Tooltip
      title={tooltipTitle}
      placement="top"
      arrow
      disableHoverListener={false}
      slotProps={{
        tooltip: {
          sx: {
            fontSize: 11.5,
            fontWeight: 600,
            px: 1,
            py: 0.5,
            bgcolor: state === 'copied' ? '#059669' : 'grey.800',
            color: 'white',
            transition: 'opacity 0.4s',
            opacity: state === 'fading' ? 0 : 1,
            '& .MuiTooltip-arrow': {
              color: state === 'copied' ? '#059669' : '#424242',
            },
          },
        },
      }}
    >
      <Box
        component="code"
        onClick={handleClick}
        sx={{
          bgcolor: state === 'copied' ? 'rgba(5, 150, 105, 0.1)' : 'rgba(15, 118, 110, 0.08)',
          color: state === 'copied' ? '#059669' : 'primary.dark',
          borderRadius: 0.75,
          px: 0.75,
          py: 0.2,
          fontSize: '0.855em',
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
          border: `1px solid ${state === 'copied' ? 'rgba(5,150,105,0.35)' : 'rgba(15, 118, 110, 0.18)'}`,
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          transition: 'all 0.25s',
          userSelect: 'none',
          '&:hover': {
            bgcolor: 'rgba(15, 118, 110, 0.14)',
            borderColor: 'rgba(15, 118, 110, 0.35)',
          },
        }}
      >
        {children}
      </Box>
    </Tooltip>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Box
      component="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      title={copied ? 'Copied!' : 'Copy'}
      sx={{
        position: 'absolute',
        top: 10,
        right: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.4,
        borderRadius: 1,
        border: '1px solid rgba(255,255,255,0.15)',
        bgcolor: 'rgba(255,255,255,0.07)',
        color: copied ? '#86efac' : 'rgba(255,255,255,0.6)',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s',
        '&:hover': { bgcolor: 'rgba(255,255,255,0.14)', color: 'white' },
      }}
    >
      {copied ? <CheckIcon sx={{ fontSize: 13 }} /> : <ContentCopyIcon sx={{ fontSize: 13 }} />}
      {copied ? 'Copied' : 'Copy'}
    </Box>
  );
}

// ─── Markdown component overrides ────────────────────────────────────────────
// Section bodies never contain h2 (stripped), so we only need h3 and below.

function buildComponents(onPartComplete: (n: number) => void) {
  return {
    h2({ children }: { children?: React.ReactNode }) {
      // Fallback — section bodies shouldn't contain h2, but just in case
      const text = childrenToText(children);
      const id = slugify(text);
      return (
        <Typography id={id} variant="h2" sx={{ mt: 4, mb: 1.5, color: 'primary.dark', scrollMarginTop: 80 }}>
          {children}
        </Typography>
      );
    },

    h3({ children }: { children?: React.ReactNode }) {
      const text = childrenToText(children);
      const id = slugify(text);
      return (
        <Typography id={id} variant="h3" sx={{ mt: 3.5, mb: 1, color: 'text.primary', scrollMarginTop: 80 }}>
          {children}
        </Typography>
      );
    },

    h4({ children }: { children?: React.ReactNode }) {
      const text = childrenToText(children);
      const id = slugify(text);
      return (
        <Typography
          id={id}
          sx={{ mt: 2.5, mb: 0.75, fontWeight: 700, fontSize: '1.1rem', color: 'text.primary', scrollMarginTop: 80 }}
        >
          {children}
        </Typography>
      );
    },

    h5({ children }: { children?: React.ReactNode }) {
      const text = childrenToText(children);
      const id = slugify(text);
      return (
        <Typography
          id={id}
          sx={{ mt: 2, mb: 0.5, fontWeight: 700, fontSize: '1rem', color: 'text.secondary', scrollMarginTop: 80 }}
        >
          {children}
        </Typography>
      );
    },

    h6({ children }: { children?: React.ReactNode }) {
      const text = childrenToText(children);
      const id = slugify(text);
      return (
        <Typography
          id={id}
          sx={{ mt: 1.5, mb: 0.5, fontWeight: 700, fontSize: '0.95rem', color: 'text.secondary', scrollMarginTop: 80 }}
        >
          {children}
        </Typography>
      );
    },

    p({ children, node }: { children?: React.ReactNode; node?: { children?: { type: string }[] } }) {
      const text = String(children ?? '');
      if (text.startsWith('- [Part') || text.startsWith('- [External')) return null;
      const onlyImage = node?.children?.length === 1 && node.children[0].type === 'image';
      if (onlyImage) return <>{children}</>;
      return (
        <Box component="div" sx={{ mb: 1.75, lineHeight: 1.8, fontSize: '1rem' }}>
          {children}
        </Box>
      );
    },

    ul({ children }: { children?: React.ReactNode }) {
      return (
        <Box component="ul" sx={{ pl: 3, mb: 2, '& > li': { mb: 0.75 } }}>
          {children}
        </Box>
      );
    },

    ol({ children }: { children?: React.ReactNode }) {
      return (
        <Box component="ol" sx={{ pl: 3, mb: 2, '& > li': { mb: 1 } }}>
          {children}
        </Box>
      );
    },

    li({ children }: { children?: React.ReactNode }) {
      return (
        <Typography component="li" variant="body1" sx={{ lineHeight: 1.75 }}>
          {children}
        </Typography>
      );
    },

    blockquote({ children }: { children?: React.ReactNode }) {
      // Detect [PART_COMPLETE:N] marker paragraph and route to CompletionCallout
      const childArray = React.Children.toArray(children);
      let partNum: number | null = null;
      const contentChildren: React.ReactNode[] = [];
      for (const child of childArray) {
        const t = childrenToText(child).trim();
        const m = t.match(/^\[PART_COMPLETE:(\d+)\]$/);
        if (m) {
          partNum = parseInt(m[1], 10);
        } else {
          contentChildren.push(child);
        }
      }
      if (partNum !== null) {
        return (
          <CompletionCallout partNum={partNum} onComplete={onPartComplete}>
            {contentChildren}
          </CompletionCallout>
        );
      }

      // Standard callout
      const text = childrenToText(children).toLowerCase();
      const isWarning =
        text.includes('watch out') ||
        text.includes('important') ||
        text.includes('critical') ||
        text.includes('never') ||
        text.includes('warning');
      const isTip =
        text.includes('tip') ||
        text.includes('verdict') ||
        text.includes('recommended') ||
        text.includes('most people');
      const severity = isWarning ? 'warning' : isTip ? 'success' : 'info';
      return (
        <Alert
          severity={severity}
          sx={{
            mb: 2.5,
            alignItems: 'flex-start',
            '& .MuiAlert-icon': { mt: '2px', mr: 1.5, py: 0 },
            '& .MuiAlert-message': {
              width: '100%',
              py: 0,
              '& > *:last-child': { mb: 0 },
            },
          }}
        >
          {children}
        </Alert>
      );
    },

    code({ children, className }: { children?: React.ReactNode; className?: string }) {
      const isBlock = className?.startsWith('language-');
      if (isBlock) {
        const codeText = childrenToText(children);
        return (
          <Box sx={{ position: 'relative', mb: 2.5 }}>
            <CopyButton text={codeText} />
            <Box
              component="pre"
              sx={{
                bgcolor: '#1e293b',
                color: '#e2e8f0',
                borderRadius: 2,
                p: 2.5,
                pr: 9,
                overflowX: 'auto',
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                lineHeight: 1.65,
                border: '1px solid rgba(255,255,255,0.08)',
                m: 0,
              }}
            >
              <code>{children}</code>
            </Box>
          </Box>
        );
      }
      const inlineText = childrenToText(children);
      // Detect internal app routes: starts with /, only lowercase letters/digits/hyphens/slashes, no dots
      const isAppRoute = /^\/[a-z][a-z0-9\-/]*$/.test(inlineText);
      const codeEl = <ClickToCopyCode text={inlineText}>{children}</ClickToCopyCode>;
      if (!isAppRoute) return codeEl;
      return (
        <Box component="span" sx={{ display: 'inline', whiteSpace: 'nowrap' }}>
          {codeEl}
          {' '}
          <Box
            component="a"
            href={inlineText}
            target="_blank"
            rel="noreferrer"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              verticalAlign: 'middle',
              gap: 0.3,
              px: 0.75,
              py: 0.2,
              borderRadius: 1,
              fontSize: 10.5,
              fontWeight: 700,
              bgcolor: 'primary.main',
              color: 'white',
              textDecoration: 'none',
              letterSpacing: 0.2,
              lineHeight: 1.4,
              '&:hover': { bgcolor: 'primary.dark', textDecoration: 'none' },
            }}
          >
            Open
            <OpenInNewIcon sx={{ fontSize: 10 }} />
          </Box>
        </Box>
      );
    },

    pre({ children }: { children?: React.ReactNode }) {
      return <>{children}</>;
    },

    table({ children }: { children?: React.ReactNode }) {
      return (
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, borderRadius: 2, overflowX: 'auto' }}>
          <Table size="small">{children}</Table>
        </TableContainer>
      );
    },

    thead({ children }: { children?: React.ReactNode }) {
      return <TableHead sx={{ bgcolor: 'rgba(15, 118, 110, 0.06)' }}>{children}</TableHead>;
    },

    tbody({ children }: { children?: React.ReactNode }) {
      return <TableBody>{children}</TableBody>;
    },

    tr({ children }: { children?: React.ReactNode }) {
      return <TableRow sx={{ '&:last-child td': { border: 0 } }}>{children}</TableRow>;
    },

    th({ children }: { children?: React.ReactNode }) {
      return (
        <TableCell sx={{ fontWeight: 800, fontSize: 12.5, color: 'text.primary', whiteSpace: 'nowrap' }}>
          {children}
        </TableCell>
      );
    },

    td({ children }: { children?: React.ReactNode }) {
      return <TableCell sx={{ fontSize: 13, verticalAlign: 'top', lineHeight: 1.65 }}>{children}</TableCell>;
    },

    hr() {
      return <Box sx={{ my: 3 }} />;
    },

    strong({ children }: { children?: React.ReactNode }) {
      return (
        <Box component="strong" sx={{ fontWeight: 800 }}>
          {children}
        </Box>
      );
    },

    a({ href, children }: { href?: string; children?: React.ReactNode }) {
      const isAnchor = href?.startsWith('#');
      if (isAnchor) {
        const id = href!.slice(1);
        return (
          <Box
            component="button"
            type="button"
            onClick={() => navigate(id)}
            sx={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'primary.main',
              textDecoration: 'underline',
              textDecorationColor: 'rgba(15, 118, 110, 0.35)',
              fontSize: 'inherit',
              fontFamily: 'inherit',
              '&:hover': { textDecorationColor: 'primary.main' },
            }}
          >
            {children}
          </Box>
        );
      }
      return (
        <Box
          component="a"
          href={href}
          target="_blank"
          rel="noreferrer"
          sx={{
            color: 'primary.main',
            textDecoration: 'underline',
            textDecorationColor: 'rgba(15, 118, 110, 0.35)',
            '&:hover': { textDecorationColor: 'primary.main' },
          }}
        >
          {children}
        </Box>
      );
    },

    img({ src, alt }: { src?: string; alt?: string }) {
      if (!src) return null;
      return (
        <Box
          sx={{
            my: 3.5,
            borderRadius: 2,
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt ?? ''} style={{ width: '100%', display: 'block' }} />
          {alt && (
            <Box
              sx={{
                px: 2,
                py: 1,
                bgcolor: 'rgba(15, 118, 110, 0.03)',
                borderTop: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                {alt}
              </Typography>
            </Box>
          )}
        </Box>
      );
    },
  };
}

// ─── SubSectionBlock (h3-level, used inside External Services only) ───────────

const SubSectionBlock = memo(function SubSectionBlock({
  sub,
  components,
}: {
  sub: SubSection;
  components: ReturnType<typeof buildComponents>;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    subExpandRegistry[sub.id] = setOpen;
    return () => {
      delete subExpandRegistry[sub.id];
    };
  }, [sub.id]);

  const renderedBody = useMemo(
    () => (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components as never}>
        {sub.body}
      </ReactMarkdown>
    ),
    // components is stable; sub.body never changes after mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sub.body],
  );

  return (
    <Box id={sub.id} sx={{ scrollMarginTop: 80 }}>
      <Box
        component="button"
        type="button"
        onClick={() => setOpen((v) => !v)}
        sx={{
          display: 'flex',
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          p: 0,
          mt: 2,
          mb: 0,
          alignItems: 'center',
          gap: 1,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          '&:hover .sub-title': { color: 'primary.main' },
        }}
      >
        <Typography
          className="sub-title"
          variant="h3"
          sx={{
            flex: 1,
            mb: 0,
            textAlign: 'left',
            color: open ? 'text.primary' : 'text.secondary',
            transition: 'color 0.15s',
          }}
        >
          {sub.title}
        </Typography>
        <ExpandMoreIcon
          sx={{
            flexShrink: 0,
            fontSize: 20,
            color: 'text.secondary',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.25s',
          }}
        />
      </Box>

      <Collapse in={open}>
        <Box sx={{ pt: 2, pb: 1 }}>{renderedBody}</Box>
      </Collapse>
    </Box>
  );
});

// ─── SectionBlock (h2-level) ──────────────────────────────────────────────────

const SectionBlock = memo(function SectionBlock({
  section,
  defaultOpen,
  components,
  isCompleted,
}: {
  section: Section;
  defaultOpen: boolean;
  components: ReturnType<typeof buildComponents>;
  isCompleted: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    expandRegistry[section.id] = setOpen;
    return () => {
      delete expandRegistry[section.id];
    };
  }, [section.id]);

  const partNum = parsePartNumber(section.title);
  const titleAfterDash = section.title.replace(/^Part\s+\d+\s*[—\-]\s*/, '');

  const subSections = useMemo(
    () => (section.isExternal ? splitSubSections(section.body) : null),
    [section.body, section.isExternal],
  );

  const renderedBody = useMemo(
    () =>
      section.isExternal && subSections ? (
        <Box>
          {subSections.map((sub) => (
            <SubSectionBlock key={sub.id} sub={sub} components={components} />
          ))}
        </Box>
      ) : (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components as never}>
          {section.body}
        </ReactMarkdown>
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [section.body, section.isExternal],
  );

  return (
    <Box id={section.id} sx={{ scrollMarginTop: 80, mt: 3 }}>
      {/* ── Toggle header ── */}
      {partNum ? (
        // Numbered Part header
        <Box
          component="button"
          type="button"
          onClick={() => setOpen((v) => !v)}
          sx={{
            display: 'flex',
            width: '100%',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            p: 0,
            alignItems: 'flex-start',
            gap: 2,
            '&:hover .sec-badge': { bgcolor: 'primary.dark' },
            '&:hover .sec-title': { color: 'primary.main' },
          }}
        >
          <Box
            className="sec-badge"
            sx={{
              flexShrink: 0,
              position: 'relative',
              width: 44,
              height: 44,
              borderRadius: 1.5,
              bgcolor: isCompleted ? '#059669' : open ? 'primary.main' : 'rgba(15, 118, 110, 0.25)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 900,
              fontFamily: 'monospace',
              mt: 0.25,
              transition: 'background-color 0.35s',
              boxShadow: isCompleted ? '0 0 0 3px rgba(5,150,105,0.25), 0 0 12px rgba(5,150,105,0.35)' : 'none',
            }}
          >
            {isCompleted ? <CheckCircleIcon sx={{ fontSize: 22 }} /> : partNum}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                color: 'primary.main',
                fontWeight: 800,
                fontSize: 11,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                mb: 0.25,
              }}
            >
              Part {parseInt(partNum, 10)}
            </Typography>
            <Typography
              variant="h2"
              className="sec-title"
              sx={{
                mb: 0,
                color: open ? 'text.primary' : 'text.secondary',
                transition: 'color 0.15s',
              }}
            >
              {titleAfterDash}
            </Typography>
          </Box>
          <ExpandMoreIcon
            sx={{
              flexShrink: 0,
              mt: 1.5,
              color: 'text.secondary',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.25s',
            }}
          />
        </Box>
      ) : (
        // Non-Part h2 (External Services Reference, Quick Reference, Troubleshooting)
        <Box
          component="button"
          type="button"
          onClick={() => setOpen((v) => !v)}
          sx={{
            display: 'flex',
            width: '100%',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            p: 0,
            pl: 2,
            alignItems: 'center',
            gap: 1.5,
            borderLeft: '4px solid',
            borderColor: open ? 'primary.main' : 'rgba(15, 118, 110, 0.3)',
            transition: 'border-color 0.2s',
            '&:hover .sec-title': { color: 'primary.main' },
          }}
        >
          <Typography
            variant="h2"
            className="sec-title"
            sx={{
              flex: 1,
              mb: 0,
              color: open ? 'primary.dark' : 'text.secondary',
              transition: 'color 0.15s',
            }}
          >
            {section.title}
          </Typography>
          <ExpandMoreIcon
            sx={{
              flexShrink: 0,
              color: 'text.secondary',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.25s',
            }}
          />
        </Box>
      )}

      {/* ── Collapsible body ── */}
      <Collapse in={open} timeout={250}>
        <Box sx={{ pt: 2.5, pb: 1 }}>
          {renderedBody}

          {/* Collapse button at the bottom of the section */}
          <Box sx={{ display: "flex", justifyContent: "center", pt: 1, pb: 2 }}>
            <Box
              component="button"
              type="button"
              onClick={() => setOpen(false)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                background: "none",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1.5,
                px: 1.5,
                py: 0.6,
                cursor: "pointer",
                color: "text.secondary",
                fontSize: 12,
                fontWeight: 600,
                transition: "all 0.15s",
                "&:hover": { borderColor: "primary.main", color: "primary.main" },
              }}
            >
              <ExpandLessIcon sx={{ fontSize: 15 }} />
              Collapse section
            </Box>
          </Box>
        </Box>
      </Collapse>
    </Box>
  );
});

// ─── Main client component ────────────────────────────────────────────────────

export function GuideClient({ content }: { content: string }) {
  const [tocOpen, setTocOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [allExpanded, setAllExpanded] = useState(false);
  const [completedParts, setCompletedParts] = useState<Set<number>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);

  // Hydrate from localStorage on first render (client-only)
  useEffect(() => {
    try {
      const stored = localStorage.getItem("guide-completed-parts");
      if (stored) {
        const parsed: number[] = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCompletedParts(new Set(parsed));
        }
      }
    } catch {
      // ignore malformed data
    }
  }, []);

  // Persist to localStorage whenever the set changes
  useEffect(() => {
    if (completedParts.size === 0) return;
    try {
      localStorage.setItem(
        "guide-completed-parts",
        JSON.stringify([...completedParts]),
      );
    } catch {
      // ignore quota / private-browsing errors
    }
  }, [completedParts]);

  const markComplete = React.useCallback((n: number) => {
    setCompletedParts((prev) => {
      if (prev.has(n)) return prev;
      return new Set([...prev, n]);
    });
  }, []);

  const toc = useMemo(() => extractToc(content), [content]);
  const components = useMemo(() => buildComponents(markComplete), [markComplete]);

  const cleanedContent = useMemo(() => {
    return content
      .replace(/^## Table of Contents[\s\S]*?^---/m, '---')
      .replace(/^# Job Search OS — User Guide for Dummies\n\nA plain-English.*\n\n---/m, '---');
  }, [content]);

  const sections = useMemo(() => splitSections(cleanedContent), [cleanedContent]);

  // Build heading → section maps and push to module-level variables for navigate()
  useEffect(() => {
    const { headingToSection, headingToSubSection } = buildHeadingMaps(sections);
    headingToSectionMap = headingToSection;
    headingToSubSectionMap = headingToSubSection;
  }, [sections]);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 600);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Scroll to hash on initial page load
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const id = hash.slice(1);
    const timer = setTimeout(() => navigate(id), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Stack spacing={3}>
      <PageHeader
        eyebrow="Documentation"
        title="User Guide"
        description="Everything you need to know, step by step. New here? Start with Part 0 and follow the setup checklist. Already running? Jump to any section below."
        actions={
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip
              icon={<MenuBookOutlinedIcon />}
              label={`${toc.filter((e) => e.level === 2).length} sections`}
              size="small"
              variant="outlined"
              color="primary"
            />
          </Stack>
        }
      />

      <TocDrawer entries={toc} open={tocOpen} onClose={() => setTocOpen(false)} />

      <Box ref={contentRef} sx={{ maxWidth: 900, mx: 'auto', width: '100%' }}>
        <ChapterOverview entries={toc} />

        {/* Expand / Collapse all toggle */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <Box
            component="button"
            type="button"
            onClick={() => {
              const next = !allExpanded;
              setAllExpanded(next);
              Object.values(expandRegistry).forEach((fn) => fn(next));
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              background: 'none',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1.5,
              px: 1.5,
              py: 0.6,
              cursor: 'pointer',
              color: 'text.secondary',
              fontSize: 12,
              fontWeight: 600,
              transition: 'all 0.15s',
              '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
            }}
          >
            {allExpanded ? <ExpandLessIcon sx={{ fontSize: 15 }} /> : <ExpandMoreIcon sx={{ fontSize: 15 }} />}
            {allExpanded ? 'Collapse all' : 'Expand all'}
          </Box>
        </Box>

        {sections.map((section) => {
          const pMatch = section.title.match(/^Part (\d+)/);
          const pNum = pMatch ? parseInt(pMatch[1], 10) : -1;
          return (
            <SectionBlock
              key={section.id}
              section={section}
              defaultOpen={section.id.startsWith('part-0')}
              components={components}
              isCompleted={pNum >= 0 && completedParts.has(pNum)}
            />
          );
        })}
      </Box>

      {/* Floating buttons */}
      <Box
        sx={{
          position: 'fixed',
          top: 72,
          right: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          zIndex: 1200,
          transition: 'opacity 0.2s, transform 0.2s',
          opacity: showScrollTop ? 1 : 0,
          transform: showScrollTop ? 'translateY(0)' : 'translateY(-8px)',
          pointerEvents: showScrollTop ? 'auto' : 'none',
        }}
      >
        <Box
          component="button"
          onClick={() => setTocOpen(true)}
          aria-label="Open table of contents"
          title="Table of contents"
          sx={{
            width: 36,
            height: 36,
            borderRadius: 1.5,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            boxShadow: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'text.secondary',
            '&:hover': { color: 'primary.main', borderColor: 'primary.main' },
          }}
        >
          <FormatListBulletedIcon sx={{ fontSize: 18 }} />
        </Box>
        <Box
          component="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Scroll to top"
          title="Back to top"
          sx={{
            width: 36,
            height: 36,
            borderRadius: 1.5,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            boxShadow: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'text.secondary',
            '&:hover': { color: 'primary.main', borderColor: 'primary.main' },
          }}
        >
          <KeyboardArrowUpIcon sx={{ fontSize: 18 }} />
        </Box>
      </Box>
    </Stack>
  );
}
