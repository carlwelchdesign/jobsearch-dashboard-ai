export const metadata = {
  title: "Job Search OS",
  description: "Personal agentic job search operating system.",
};

import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
