"use client";

import dynamic from "next/dynamic";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v13-appRouter";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "./theme";

const LazyJoleneAgentButton = dynamic(
  () => import("@/components/lazy-jolene-agent-button").then((module) => module.LazyJoleneAgentButton),
  { ssr: false },
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: "mui", enableCssLayer: true }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
        <LazyJoleneAgentButton />
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
