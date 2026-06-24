"use client";

import AddCircleOutlineOutlinedIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AddCompanySourceFormProps = {
  categories: string[];
};

const initialForm = {
  name: "",
  priority: 2,
  categories: "",
  greenhouseSlugs: "",
  leverSlugs: "",
  ashbySlugs: "",
};

export function AddCompanySourceForm({ categories }: AddCompanySourceFormProps) {
  const { refresh } = useRouter();
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function addCompany() {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch("/api/settings/company-source", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Unable to add company source.");
      setNotice(payload.message ?? "Company source added.");
      setForm(initialForm);
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add company source.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={2}>
      {notice ? <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert> : null}
      {error ? <Alert severity="error" onClose={() => setError("")}>{error}</Alert> : null}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "2fr 1fr 2fr" }, gap: 1.5 }}>
        <TextField
          label="Company"
          value={form.name}
          onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
          placeholder="ExampleCo"
        />
        <TextField
          select
          label="Priority"
          value={form.priority}
          onChange={(event) => setForm((previous) => ({ ...previous, priority: Number(event.target.value) }))}
        >
          <MenuItem value={1}>P1</MenuItem>
          <MenuItem value={2}>P2</MenuItem>
          <MenuItem value={3}>P3</MenuItem>
        </TextField>
        <TextField
          label="Categories"
          value={form.categories}
          onChange={(event) => setForm((previous) => ({ ...previous, categories: event.target.value }))}
          placeholder={categories.slice(0, 3).join(", ") || "custom"}
        />
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1.5 }}>
        <TextField
          label="Greenhouse slugs"
          value={form.greenhouseSlugs}
          onChange={(event) => setForm((previous) => ({ ...previous, greenhouseSlugs: event.target.value }))}
          placeholder="exampleco"
        />
        <TextField
          label="Lever slugs"
          value={form.leverSlugs}
          onChange={(event) => setForm((previous) => ({ ...previous, leverSlugs: event.target.value }))}
          placeholder="exampleco"
        />
        <TextField
          label="Ashby slugs"
          value={form.ashbySlugs}
          onChange={(event) => setForm((previous) => ({ ...previous, ashbySlugs: event.target.value }))}
          placeholder="exampleco"
        />
      </Box>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
        <Alert severity="info" sx={{ flex: 1 }}>
          Search terms and careers query are generated automatically. Leave slugs blank to generate common ATS slug variants.
        </Alert>
        <Button disabled={saving || !form.name.trim()} variant="contained" startIcon={<AddCircleOutlineOutlinedIcon />} onClick={() => void addCompany()}>
          Add company
        </Button>
      </Stack>
    </Stack>
  );
}
