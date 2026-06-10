"use client";

import { useEffect } from "react";

const LEGACY_SETTINGS_HASH_ROUTES: Record<string, string> = {
  "settings-service-health": "/settings/system",
  "settings-ai": "/settings/system",
  "settings-email-sync": "/settings/system",
  "settings-notifications": "/settings/system",
  "settings-cron": "/settings/search",
  "settings-company-sources": "/settings/search",
  "settings-automation": "/settings/application",
  "settings-github": "/settings/application",
  "settings-profile-links": "/settings/application",
  "settings-demographics": "/settings/application",
  "settings-agent-quality": "/settings/learning",
  "settings-outcome-calibration": "/settings/learning",
  "settings-learning-impact": "/settings/learning",
  "settings-field-learning": "/settings/learning",
  "settings-skill-learning": "/settings/learning",
  "settings-tools": "/settings/admin",
};

export function SettingsLegacyHashRedirect() {
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const route = LEGACY_SETTINGS_HASH_ROUTES[hash];
    if (!route) return;
    window.location.replace(`${route}#${hash}`);
  }, []);

  return null;
}
