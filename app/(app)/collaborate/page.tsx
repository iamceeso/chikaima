import { redirect } from "next/navigation";

/** The AI team workspace moved to projects. */
export default function CollaboratePage() {
  redirect("/projects");
}
