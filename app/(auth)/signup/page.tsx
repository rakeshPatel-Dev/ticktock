import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { BrandMark } from "@/components/brand-mark";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create account - TickTock",
  description: "Create your TickTock account to start tracking focus time.",
};

export default function SignupPage() {
  return (
    <Card className="w-full max-w-sm border-border/60 bg-card/50 rounded-4xl shadow-xs">
      <CardContent className="pt-8 pb-8 px-7">
        <div className="flex flex-col items-center gap-3 mb-6">
          <BrandMark />
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Create your account
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pick a username and password to start tracking your focused hours.
          </p>
        </div>

        <SignupForm />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-foreground hover:underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}