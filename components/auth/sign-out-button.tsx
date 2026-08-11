"use client";

import { useMutation } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import { useAuthStore } from "@/store/auth-store";

export function SignOutButton({
  variant = "outline",
  redirectTo = "/",
  className,
}: {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  redirectTo?: string;
  className?: string;
}) {
  const router = useRouter();
  const token = useAuthStore((state) => state.tokens?.access_token);
  const clearSession = useAuthStore((state) => state.clearSession);

  const mutation = useMutation({
    mutationFn: async () => {
      if (token) {
        await api.logout(token);
      }
    },
    onSettled: () => {
      clearSession();
      router.replace(redirectTo);
    },
  });

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      <LogOut className="h-4 w-4" />
      <span className="ml-2">{mutation.isPending ? "Signing out..." : "Sign out"}</span>
    </Button>
  );
}
