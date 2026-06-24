import { SettingsRouteContent } from "../settings-content";

export { dynamic } from "../settings-content";

export default async function AdminSettingsPage({ searchParams }: { searchParams?: { highlight?: string } }) {
  return <SettingsRouteContent group="admin" searchParams={searchParams} />;
}
