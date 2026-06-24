import { ResumeUploadClient } from "./upload-client";

export const metadata = {
  title: "Upload Resume | Job Search OS",
  description: "Upload source resumes for parsing and review.",
};

export default function ResumeUploadPage() {
  return <ResumeUploadClient />;
}
