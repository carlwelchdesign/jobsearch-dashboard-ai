import { SettingsRouteContent } from "../settings-content";

export { dynamic } from "../settings-content";

export default async function LearningSettingsPage({ searchParams }: { searchParams?: { highlight?: string; host?: string; applicationId?: string } }) {
  return <SettingsRouteContent group="learning" searchParams={searchParams} />;
}
