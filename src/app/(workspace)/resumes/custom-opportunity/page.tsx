import { CustomOpportunityClient } from "./custom-opportunity-client";

export const metadata = {
  title: "Custom Opportunity Resume | Job Search OS",
  description: "Generate a tailored resume from a recruiter-provided role brief.",
};

export default function CustomOpportunityPage() {
  return <CustomOpportunityClient />;
}
