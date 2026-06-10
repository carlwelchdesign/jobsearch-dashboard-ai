import { SettingsRouteContent } from "../settings-content";

export { dynamic } from "../settings-content";

export default async function SearchSettingsPage({ searchParams }: { searchParams?: { highlight?: string } }) {
  return <SettingsRouteContent group="search" searchParams={searchParams} />;
}
