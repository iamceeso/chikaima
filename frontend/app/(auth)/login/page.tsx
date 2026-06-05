import { LoginForm } from "@/components/auth/auth-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.14),_transparent_20%),linear-gradient(180deg,_#07111f,_#0d1628)] px-6">
      <LoginForm />
    </main>
  );
}
