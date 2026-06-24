import { redirect } from "next/navigation";

export const metadata = {
  title: "Field Learning | Job Search OS",
  description: "Field Learning now lives in Learning settings.",
};

export const dynamic = "force-dynamic";

export default function ApplicationFieldLearningRedirect({ searchParams }: { searchParams?: { host?: string; applicationId?: string } }) {
  const params = new URLSearchParams();
  if (searchParams?.host?.trim()) params.set("host", searchParams.host.trim());
  if (searchParams?.applicationId?.trim()) params.set("applicationId", searchParams.applicationId.trim());
  const query = params.toString();
  redirect(`/settings/learning${query ? `?${query}` : ""}#settings-field-learning`);
}
