import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import { AppShellNav } from "./app-shell-nav";

const drawerWidth = 264;

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        backgroundImage:
          "linear-gradient(180deg, rgba(104, 85, 52, 0.08) 0px, rgba(104, 85, 52, 0) 260px), linear-gradient(90deg, rgba(15, 118, 110, 0.06) 0px, rgba(15, 118, 110, 0) 360px)",
      }}
    >
      <AppShellNav />
      <Box component="main" sx={{ pl: { lg: `${drawerWidth}px` } }}>
        <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 }, px: { xs: 2, sm: 3 } }}>
          {children}
        </Container>
      </Box>
    </Box>
  );
}
