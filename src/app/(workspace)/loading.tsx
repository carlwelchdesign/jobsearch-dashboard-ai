import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import LinearProgress from "@mui/material/LinearProgress";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";

export default function WorkspaceLoading() {
  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Skeleton variant="text" width={120} height={20} />
        <Skeleton variant="text" width="min(520px, 80%)" height={44} />
        <Skeleton variant="text" width="min(720px, 100%)" height={24} />
      </Stack>
      <Card>
        <CardContent>
          <Stack spacing={2}>
            <LinearProgress />
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
              <Skeleton variant="rounded" height={118} />
              <Skeleton variant="rounded" height={118} />
              <Skeleton variant="rounded" height={118} />
            </Box>
          </Stack>
        </CardContent>
      </Card>
      <Skeleton variant="rounded" height={260} />
    </Stack>
  );
}
