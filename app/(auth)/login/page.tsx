import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in - TickTock",
  description: "Sign in to your TickTock account.",
};

export default function LoginPage() {
  return (
    <Card className="w-full max-w-sm border-border/60 bg-card/50 rounded-4xl shadow-xs">
      <CardContent className="pt-8 pb-8 px-7">
        <div className="flex flex-col items-center gap-3 mb-6">
          <BrandMark />
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Welcome back
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sign in with your username to keep tracking your focus.
          </p>
        </div>

        <LoginForm />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link
            href="/signup"
            className="font-semibold text-foreground hover:underline underline-offset-4"
          >
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}