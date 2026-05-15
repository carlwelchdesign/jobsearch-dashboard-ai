"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import AssignmentTurnedInOutlinedIcon from "@mui/icons-material/AssignmentTurnedInOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import ManageSearchOutlinedIcon from "@mui/icons-material/ManageSearchOutlined";
import PolicyOutlinedIcon from "@mui/icons-material/PolicyOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import WorkOutlineOutlinedIcon from "@mui/icons-material/WorkOutlineOutlined";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
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
  { href: "/dashboard", label: "Command Center", eyebrow: "Home", icon: DashboardOutlinedIcon },
  { href: "/profiles", label: "1. Profiles", eyebrow: "Set intent", icon: ManageSearchOutlinedIcon },
  { href: "/evidence", label: "Evidence", eyebrow: "Truth layer", icon: PolicyOutlinedIcon },
  { href: "/jobs", label: "2. Review Jobs", eyebrow: "Approve matches", icon: WorkOutlineOutlinedIcon },
  { href: "/resumes", label: "3. Materials", eyebrow: "Resume source", icon: FactCheckOutlinedIcon },
  { href: "/applications", label: "4. Ready Queue", eyebrow: "Track packages", icon: AssignmentTurnedInOutlinedIcon },
  { href: "/applications/assistant", label: "5. Apply Sprint", eyebrow: "Submit manually", icon: BoltOutlinedIcon },
  { href: "/runs", label: "Search Runs", eyebrow: "Worker logs", icon: HistoryOutlinedIcon },
  { href: "/settings", label: "Settings", eyebrow: "Sources", icon: SettingsOutlinedIcon },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        backgroundImage:
          "linear-gradient(180deg, rgba(104, 85, 52, 0.08) 0px, rgba(104, 85, 52, 0) 260px), linear-gradient(90deg, rgba(15, 118, 110, 0.06) 0px, rgba(15, 118, 110, 0) 360px)",
      }}
    >
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

            return (
              <ListItemButton
                key={item.href}
                component={Link}
                href={item.href}
                selected={selected}
                sx={{
                  mb: 0.5,
                  minHeight: 44,
                  color: selected ? "primary.dark" : "text.secondary",
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
                <ListItemIcon sx={{ minWidth: 38, color: selected ? "inherit" : "text.secondary" }}>
                  <Icon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Stack spacing={0.1}>
                      <Typography component="span" sx={{ fontSize: 14, fontWeight: 800, lineHeight: 1.25 }}>
                        {item.label}
                      </Typography>
                      <Typography component="span" variant="caption" color={selected ? "primary.dark" : "text.secondary"} sx={{ lineHeight: 1.2 }}>
                        {item.eyebrow}
                      </Typography>
                    </Stack>
                  }
                />
              </ListItemButton>
            );
          })}
        </List>
        <Box sx={{ mt: "auto", p: 2 }}>
          <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, bgcolor: "#ffffff", p: 1.5 }}>
            <Stack spacing={1}>
              <Chip size="small" color="success" variant="outlined" label="Human approval required" sx={{ alignSelf: "flex-start" }} />
              <Typography variant="caption" color="text.secondary">
                Discovery and tailoring are automated. Submissions stay manual.
              </Typography>
            </Stack>
          </Box>
        </Box>
      </Drawer>

      <Box component="main" sx={{ pl: { lg: `${drawerWidth}px` } }}>
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
              <Chip size="small" color="success" variant="outlined" label="Manual submit" />
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

              return (
                <Tooltip key={item.href} title={`${item.label}: ${item.eyebrow}`}>
                  <IconButton
                    component={Link}
                    href={item.href}
                    aria-label={item.label}
                    color={selected ? "primary" : "default"}
                    sx={{
                      flex: "0 0 auto",
                      width: 42,
                      height: 42,
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: selected ? "primary.main" : "divider",
                      bgcolor: selected ? "#e6f5f3" : "transparent",
                    }}
                  >
                    <Icon fontSize="small" />
                  </IconButton>
                </Tooltip>
              );
            })}
          </Box>
        </Box>
        <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 }, px: { xs: 2, sm: 3 } }}>
          {children}
        </Container>
      </Box>
    </Box>
  );
}
