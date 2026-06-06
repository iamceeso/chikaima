import { GuestRoute } from "@/components/auth/guest-route";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <GuestRoute>{children}</GuestRoute>;
}
