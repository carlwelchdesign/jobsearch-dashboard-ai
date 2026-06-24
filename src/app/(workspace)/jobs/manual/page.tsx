import { ManualJobClient } from "./manual-job-client";

export const metadata = {
  title: "Add Manual Job | Job Search OS",
  description: "Capture and score a manually entered job posting.",
};

export default function ManualJobPage() {
  return <ManualJobClient />;
}
