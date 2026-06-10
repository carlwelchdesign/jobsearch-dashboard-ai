import { SettingsRouteContent } from "../settings-content";

export { dynamic } from "../settings-content";

export default async function SystemSettingsPage({ searchParams }: { searchParams?: { highlight?: string } }) {
  return <SettingsRouteContent group="system" searchParams={searchParams} />;
}
