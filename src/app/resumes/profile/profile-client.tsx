"use client";

import AddIcon from "@mui/icons-material/Add";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
import VerifiedOutlinedIcon from "@mui/icons-material/VerifiedOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";

type Bullet = {
  id: string;
  company: string;
  role: string;
  category: string;
  text: string;
  keywords: string[];
  sourceText: string | null;
  truthLevel: string;
};

type ProfileClientProps = {
  profile: {
    id: string;
    fullName: string;
    email: string;
    professionalSummary: string | null;
  };
  bullets: Bullet[];
};

const categories = [
  "frontend",
  "fullstack",
  "testing",
  "security",
  "ai",
  "leadership",
  "visualization",
  "saas",
  "design_systems",
  "devtools",
];

export function ResumeProfileClient({ profile, bullets }: ProfileClientProps) {
  const { refresh } = useRouter();
  const [open, setOpen] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [digestLoading, setDigestLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setLoading(true);
    setNotice("");
    setError("");

    const formData = new FormData(form);
    const response = await fetch("/api/resumes/bullets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userProfileId: profile.id,
        company: formData.get("company"),
        role: formData.get("role"),
        category: formData.get("category"),
        text: formData.get("text"),
        keywords: formData.get("keywords"),
        sourceText: formData.get("sourceText"),
        truthLevel: formData.get("truthLevel"),
      }),
    });
    const body = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(body.error ?? "Unable to add bullet.");
      return;
    }

    setNotice("Verified bullet added to the candidate profile.");
    setOpen(false);
    form.reset();
    refresh();
  }

  async function digestRoleDescription(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setDigestLoading(true);
    setNotice("");
    setError("");

    const formData = new FormData(form);
    const response = await fetch("/api/resumes/bullets/digest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        userProfileId: profile.id,
        company: formData.get("digestCompany") || undefined,
        role: formData.get("digestRole") || undefined,
        category: formData.get("digestCategory"),
        focusAreas: formData.get("focusAreas"),
        description: formData.get("description"),
      }),
    });
    const body = await response.json();
    setDigestLoading(false);

    if (!response.ok) {
      setError(body.error ?? "Unable to digest role description.");
      return;
    }

    const warningText = Array.isArray(body.warnings) && body.warnings.length ? ` ${body.warnings.join(" ")}` : "";
    setNotice(`${body.message ?? "Proposed bullets created."}${warningText}`);
    setDigestOpen(false);
    form.reset();
    refresh();
  }

  async function approveBullet(id: string) {
    setActionId(id);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/resumes/bullets/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ truthLevel: "verified" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to approve bullet.");
      setNotice("Bullet approved for resume generation.");
      refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to approve bullet.");
    } finally {
      setActionId(null);
    }
  }

  async function rejectBullet(id: string) {
    setActionId(id);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/resumes/bullets/${id}`, { method: "DELETE" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to reject bullet.");
      setNotice("Proposed bullet rejected.");
      refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to reject bullet.");
    } finally {
      setActionId(null);
    }
  }

  async function updateBullet(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setActionId(id);
    setNotice("");
    setError("");
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/resumes/bullets/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company: formData.get("editCompany"),
          role: formData.get("editRole"),
          category: formData.get("editCategory"),
          text: formData.get("editText"),
          keywords: formData.get("editKeywords"),
          sourceText: formData.get("editSourceText"),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Unable to update bullet.");
      setNotice("Bullet updated.");
      setEditingId(null);
      refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Unable to update bullet.");
    } finally {
      setActionId(null);
    }
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        eyebrow="Source of truth"
        title="Candidate Profile"
        description={`${profile.fullName} · ${profile.email}`}
        actions={
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button variant="outlined" startIcon={<AutoFixHighOutlinedIcon />} onClick={() => setDigestOpen((value) => !value)}>
              {digestOpen ? "Close digest" : "Digest role description"}
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen((value) => !value)}>
              {open ? "Close form" : "Add bullet"}
            </Button>
          </Stack>
        }
      />

      {notice ? <Alert severity="success">{notice}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}

      <Collapse in={digestOpen}>
        <Card>
          <CardContent>
            <Stack component="form" spacing={2} onSubmit={digestRoleDescription}>
              <Typography variant="h3">Digest role description</Typography>
              <Typography variant="body2" color="text.secondary">
                Paste a LinkedIn-style role block or source text for a past role. The app will infer company and title when possible and create proposed bullets as needs_review.
              </Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
                <TextField name="digestCompany" label="Company override" helperText="Optional when pasted text includes company" />
                <TextField name="digestRole" label="Role override" helperText="Optional when pasted text includes title" />
                <TextField select name="digestCategory" label="Category override" defaultValue="">
                  <MenuItem value="">Infer category</MenuItem>
                  {categories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
                </TextField>
              </Box>
              <TextField name="focusAreas" label="Focus areas" helperText="Optional comma-separated themes, tools, or outcomes to prioritize" />
              <TextField
                required
                multiline
                minRows={7}
                name="description"
                label="Pasted role block"
                helperText="Paste the whole block, including title, company, dates, paragraphs, and bullets. The digest will avoid unsupported metrics or claims."
              />
              <Button type="submit" variant="contained" disabled={digestLoading} sx={{ alignSelf: "flex-start" }}>
                {digestLoading ? "Digesting..." : "Create proposed bullets"}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Collapse>

      <Collapse in={open}>
        <Card>
          <CardContent>
            <Stack component="form" spacing={2} onSubmit={submit}>
              <Typography variant="h3">New verified bullet</Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 2 }}>
                <TextField required name="company" label="Company" />
                <TextField required name="role" label="Role" />
                <TextField select required name="category" label="Category" defaultValue="frontend">
                  {categories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
                </TextField>
                <TextField select required name="truthLevel" label="Truth level" defaultValue="verified">
                  <MenuItem value="verified">verified</MenuItem>
                  <MenuItem value="estimated">estimated</MenuItem>
                  <MenuItem value="needs_review">needs_review</MenuItem>
                </TextField>
              </Box>
              <TextField required multiline minRows={3} name="text" label="Bullet text" />
              <TextField name="keywords" label="Keywords" helperText="Comma-separated, used for matching and tailoring" />
              <TextField multiline minRows={2} name="sourceText" label="Source text / evidence" helperText="Paste the resume/profile evidence supporting this claim." />
              <Button type="submit" variant="contained" disabled={loading} sx={{ alignSelf: "flex-start" }}>
                {loading ? "Saving..." : "Save bullet"}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Collapse>

      <Card>
        <CardContent>
          <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography variant="h3">Verified Bullet Bank</Typography>
            <Stack direction="row" spacing={1}>
              <Chip color="success" label={`${bullets.filter((bullet) => bullet.truthLevel === "verified").length} verified`} />
              <Chip color="warning" variant="outlined" label={`${bullets.filter((bullet) => bullet.truthLevel === "needs_review").length} proposed`} />
            </Stack>
          </Stack>
          <List>
            {bullets.map((bullet) => (
              <ListItem key={bullet.id} divider alignItems="flex-start">
                <ListItemIcon>
                  <VerifiedOutlinedIcon color={bullet.truthLevel === "verified" ? "success" : "warning"} />
                </ListItemIcon>
                <ListItemText
                  primary={(
                    <Stack spacing={1}>
                      <Typography>{bullet.text}</Typography>
                      {editingId === bullet.id ? (
                        <Stack component="form" spacing={1.5} onSubmit={(event) => void updateBullet(event, bullet.id)}>
                          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1.5 }}>
                            <TextField required size="small" name="editCompany" label="Company" defaultValue={bullet.company} />
                            <TextField required size="small" name="editRole" label="Role" defaultValue={bullet.role} />
                            <TextField select required size="small" name="editCategory" label="Category" defaultValue={bullet.category}>
                              {categories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
                            </TextField>
                          </Box>
                          <TextField required multiline minRows={2} size="small" name="editText" label="Bullet text" defaultValue={bullet.text} />
                          <TextField size="small" name="editKeywords" label="Keywords" defaultValue={bullet.keywords.join(", ")} />
                          <TextField multiline minRows={2} size="small" name="editSourceText" label="Source text" defaultValue={bullet.sourceText ?? ""} />
                          <Stack direction="row" spacing={1}>
                            <Button type="submit" size="small" variant="contained" disabled={actionId === bullet.id}>
                              {actionId === bullet.id ? "Saving..." : "Save edits"}
                            </Button>
                            <Button type="button" size="small" variant="outlined" disabled={actionId === bullet.id} onClick={() => setEditingId(null)}>
                              Cancel
                            </Button>
                          </Stack>
                        </Stack>
                      ) : null}
                    </Stack>
                  )}
                  secondary={`${bullet.company} · ${bullet.role} · ${bullet.category} · ${bullet.truthLevel}`}
                />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ ml: 2, alignItems: { sm: "center" } }}>
                  {bullet.truthLevel === "needs_review" ? (
                    <Button size="small" variant="contained" color="success" disabled={actionId === bullet.id} onClick={() => void approveBullet(bullet.id)}>
                      Approve
                    </Button>
                  ) : null}
                  <Button size="small" variant="outlined" disabled={actionId === bullet.id} onClick={() => setEditingId((current) => current === bullet.id ? null : bullet.id)}>
                    Edit
                  </Button>
                  {bullet.truthLevel === "needs_review" ? (
                    <Button size="small" variant="outlined" color="error" disabled={actionId === bullet.id} onClick={() => void rejectBullet(bullet.id)}>
                      Reject
                    </Button>
                  ) : null}
                </Stack>
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>
    </Stack>
  );
}
