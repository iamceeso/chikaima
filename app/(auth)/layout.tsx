import { Suspense } from "react";

import { GuestRoute } from "@/components/auth/guest-route";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
          <p className="text-sm text-foreground-muted">Loading...</p>
        </div>
      }
    >
      <GuestRoute>{children}</GuestRoute>
    </Suspense>
  );
}
