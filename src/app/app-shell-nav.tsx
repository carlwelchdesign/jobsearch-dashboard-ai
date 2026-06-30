"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import MoreHorizOutlinedIcon from "@mui/icons-material/MoreHorizOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import TimelineOutlinedIcon from "@mui/icons-material/TimelineOutlined";
import WorkOutlineOutlinedIcon from "@mui/icons-material/WorkOutlineOutlined";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

const drawerWidth = 264;

const navItems = [
  { href: "/dashboard", label: "Today", eyebrow: "Daily cockpit", icon: DashboardOutlinedIcon },
  { href: "/dashboard/search", label: "Find Jobs", eyebrow: "Search and decide", icon: WorkOutlineOutlinedIcon },
  { href: "/applications/assistant", label: "Apply", eyebrow: "Daily sprint", icon: BoltOutlinedIcon },
  { href: "/applications", label: "Applications", eyebrow: "Track outcomes", icon: AssignmentTurnedInOutlinedIcon },
  { href: "/resumes/generated", label: "Materials", eyebrow: "Resumes", icon: DescriptionOutlinedIcon },
  { href: "/needs-me", label: "Follow Up", eyebrow: "Needs you", icon: TimelineOutlinedIcon },
  { href: "/settings", label: "Settings", eyebrow: "Configure", icon: SettingsOutlinedIcon },
  { href: "/architecture", label: "System", eyebrow: "Diagnostics", icon: MoreHorizOutlinedIcon },
];

const settingsSubItems = [
  { href: "/settings/system", label: "System" },
  { href: "/settings/search", label: "Search" },
  { href: "/settings/application", label: "Application" },
  { href: "/settings/learning", label: "Learning" },
  { href: "/settings/admin", label: "Admin" },
];

const systemSubItems = [
  { href: "/jobs", label: "Job Admin", icon: FactCheckOutlinedIcon },
  { href: "/evidence", label: "Evidence", icon: FactCheckOutlinedIcon },
  { href: "/outcomes", label: "Outcomes", icon: TimelineOutlinedIcon },
  { href: "/profiles", label: "Profiles", icon: AccountTreeOutlinedIcon },
  { href: "/agents", label: "Agent Board", icon: AutoAwesomeOutlinedIcon },
  { href: "/architecture", label: "Architecture", icon: AccountTreeOutlinedIcon },
  { href: "/guide", label: "User Guide", icon: MenuBookOutlinedIcon },
];

export function AppShellNav() {
  const pathname = usePathname();
  const settingsActive = pathname === "/settings" || pathname.startsWith("/settings/");
  const systemActive = systemSubItems.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const [settingsExpanded, setSettingsExpanded] = useState(settingsActive);
  const [systemExpanded, setSystemExpanded] = useState(systemActive);

  return (
    <>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", lg: "block" },
          width: drawerWidth,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            borderRightColor: "divider",
            boxSizing: "border-box",
            bgcolor: "#fffdf8",
            backgroundImage: "linear-gradient(180deg, #fffdf8 0%, #f4f0e7 100%)",
          },
        }}
      >
        <Toolbar sx={{ minHeight: 96, px: 3 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Avatar
              variant="rounded"
              sx={{
                bgcolor: "primary.main",
                color: "primary.contrastText",
                width: 42,
                height: 42,
                boxShadow: "0 10px 24px rgba(15, 118, 110, 0.25)",
              }}
            >
              <AutoAwesomeOutlinedIcon fontSize="small" />
            </Avatar>
            <Stack spacing={0.25}>
              <Typography variant="overline" color="primary" sx={{ fontWeight: 900, letterSpacing: 0 }}>
                Job Search OS
              </Typography>
              <Typography variant="h3" sx={{ lineHeight: 1.1 }}>Apply System</Typography>
            </Stack>
          </Stack>
        </Toolbar>
        <Divider />
        <List sx={{ p: 1.5 }}>
          {navItems.map((item) => {
            const selected = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            const isSettings = item.href === "/settings";
            const isSystem = item.href === "/architecture";
            const showSettingsChildren = isSettings && (settingsExpanded || settingsActive);
            const showSystemChildren = isSystem && (systemExpanded || systemActive);
            const selectedForItem = isSystem ? systemActive : selected;

            return (
              <Box key={item.href}>
                <ListItemButton
                  component={Link}
                  href={item.href}
                  selected={selectedForItem}
                  onClick={() => {
                    setSettingsExpanded(isSettings);
                    setSystemExpanded(isSystem);
                  }}
                  sx={{
                    mb: 0.5,
                    minHeight: 44,
                    color: selectedForItem ? "primary.dark" : "text.secondary",
                    border: "1px solid transparent",
                    "&:hover": {
                      bgcolor: "#eef7f6",
                      color: "primary.dark",
                    },
                    "&.Mui-selected": {
                      bgcolor: "#e6f5f3",
                      color: "primary.dark",
                      borderColor: "#b7ded8",
                      "&:hover": { bgcolor: "#d9efec" },
                      "& .MuiListItemIcon-root": { color: "primary.dark" },
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 38, color: selectedForItem ? "inherit" : "text.secondary" }}>
                    <Icon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    secondary={item.eyebrow}
                    sx={{
                      "& .MuiListItemText-primary": { fontSize: 14, fontWeight: 800, lineHeight: 1.25 },
                      "& .MuiListItemText-secondary": { color: selectedForItem ? "primary.dark" : "text.secondary", lineHeight: 1.2 },
                    }}
                  />
                </ListItemButton>
                {showSettingsChildren ? <SubNav pathname={pathname} items={settingsSubItems} /> : null}
                {showSystemChildren ? <SubNav pathname={pathname} items={systemSubItems} /> : null}
              </Box>
            );
          })}
        </List>
      </Drawer>
      <MobileNav pathname={pathname} />
    </>
  );
}

function SubNav({ pathname, items }: { pathname: string; items: Array<{ href: string; label: string }> }) {
  return (
    <Stack spacing={0.25} sx={{ mb: 0.75, ml: 5 }}>
      {items.map((subItem) => {
        const subSelected = pathname === subItem.href || pathname.startsWith(`${subItem.href}/`);
        return (
          <ListItemButton
            key={subItem.href}
            component={Link}
            href={subItem.href}
            selected={subSelected}
            sx={{
              minHeight: 32,
              py: 0.5,
              px: 1,
              borderRadius: 1,
              color: subSelected ? "primary.dark" : "text.secondary",
              "&.Mui-selected": {
                bgcolor: "#e6f5f3",
                color: "primary.dark",
                "&:hover": { bgcolor: "#d9efec" },
              },
            }}
          >
            <ListItemText
              primary={subItem.label}
              sx={{ "& .MuiListItemText-primary": { fontSize: 13, fontWeight: 800, lineHeight: 1.2 } }}
            />
          </ListItemButton>
        );
      })}
    </Stack>
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  return (
    <Box
      sx={{
        display: { xs: "block", lg: "none" },
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        position: "sticky",
        top: 0,
        zIndex: 1100,
        boxShadow: "0 8px 28px rgba(15, 23, 42, 0.08)",
      }}
    >
      <Box sx={{ px: 2, py: 1.5 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
            <Avatar variant="rounded" sx={{ width: 34, height: 34, bgcolor: "primary.main", color: "primary.contrastText" }}>
              <AutoAwesomeOutlinedIcon fontSize="small" />
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h3" sx={{ lineHeight: 1.1 }}>Job Search OS</Typography>
              <Typography variant="caption" color="text.secondary">Apply System</Typography>
            </Box>
          </Stack>
        </Stack>
      </Box>
      <Box
        component="nav"
        aria-label="Mobile navigation"
        sx={{
          display: "flex",
          gap: 0.5,
          overflowX: "auto",
          px: 1,
          pb: 1,
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {navItems.map((item) => {
          const selected = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          const shortLabel = item.label.length > 10 ? item.label.split(" ")[0] : item.label;

          return (
            <Tooltip key={item.href} title={`${item.label}: ${item.eyebrow}`}>
              <Box
                component={Link}
                href={item.href}
                aria-label={item.label}
                sx={{
                  flex: "0 0 auto",
                  minWidth: 72,
                  minHeight: 48,
                  px: 1,
                  py: 0.75,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: selected ? "primary.main" : "divider",
                  bgcolor: selected ? "#e6f5f3" : "background.paper",
                  color: selected ? "primary.dark" : "text.secondary",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.25,
                }}
              >
                <Icon fontSize="small" />
                <Typography variant="caption" sx={{ fontSize: 11, fontWeight: 800, lineHeight: 1 }}>
                  {shortLabel}
                </Typography>
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    </Box>
  );
}
