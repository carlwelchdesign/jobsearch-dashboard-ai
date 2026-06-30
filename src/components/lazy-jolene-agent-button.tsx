"use client";

import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import Fab from "@mui/material/Fab";
import Tooltip from "@mui/material/Tooltip";
import dynamic from "next/dynamic";
import { useState } from "react";

const JoleneAgentButton = dynamic(
  () => import("@/components/jolene-agent-button").then((module) => module.JoleneAgentButton),
  {
    ssr: false,
    loading: () => null,
  },
);

export function LazyJoleneAgentButton() {
  const [loaded, setLoaded] = useState(false);

  if (loaded) return <JoleneAgentButton />;

  return (
    <Tooltip title="Open Jolene">
      <Fab
        color="primary"
        aria-label="Open Jolene"
        onClick={() => setLoaded(true)}
        sx={{ position: "fixed", right: 24, bottom: 24, zIndex: 1300 }}
      >
        <AutoAwesomeOutlinedIcon />
      </Fab>
    </Tooltip>
  );
}
