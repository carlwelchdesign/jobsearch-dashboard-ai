import { SettingsRouteContent } from "../settings-content";

export { dynamic } from "../settings-content";

export default async function ApplicationSettingsPage({ searchParams }: { searchParams?: { highlight?: string } }) {
  return <SettingsRouteContent group="application" searchParams={searchParams} />;
}
