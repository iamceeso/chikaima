import { AuthenticatedRoute } from "@/components/auth/authenticated-route";
import { AppShell } from "@/components/layout/app-shell";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthenticatedRoute>
      <AppShell>{children}</AppShell>
    </AuthenticatedRoute>
  );
}
