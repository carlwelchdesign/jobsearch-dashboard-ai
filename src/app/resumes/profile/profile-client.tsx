"use client";

import AddIcon from "@mui/icons-material/Add";
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
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice("");
    setError("");

    const formData = new FormData(event.currentTarget);
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
    event.currentTarget.reset();
    refresh();
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        eyebrow="Source of truth"
        title="Candidate Profile"
        description={`${profile.fullName} · ${profile.email}`}
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen((value) => !value)}>
            {open ? "Close form" : "Add bullet"}
          </Button>
        }
      />

      {notice ? <Alert severity="success">{notice}</Alert> : null}
      {error ? <Alert severity="error">{error}</Alert> : null}

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
            <Chip color="success" label={`${bullets.filter((bullet) => bullet.truthLevel === "verified").length} verified`} />
          </Stack>
          <List>
            {bullets.map((bullet) => (
              <ListItem key={bullet.id} divider>
                <ListItemIcon>
                  <VerifiedOutlinedIcon color={bullet.truthLevel === "verified" ? "success" : "warning"} />
                </ListItemIcon>
                <ListItemText
                  primary={bullet.text}
                  secondary={`${bullet.company} · ${bullet.role} · ${bullet.category} · ${bullet.truthLevel}`}
                />
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>
    </Stack>
  );
}
