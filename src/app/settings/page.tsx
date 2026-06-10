import { SettingsLegacyHashRedirect } from "./settings-legacy-hash-redirect";
import { SettingsRouteContent } from "./settings-content";

export { dynamic } from "./settings-content";

export default async function SettingsPage({ searchParams }: { searchParams?: { highlight?: string } }) {
  return (
    <>
      <SettingsLegacyHashRedirect />
      <SettingsRouteContent group="overview" searchParams={searchParams} />
    </>
  );
}
