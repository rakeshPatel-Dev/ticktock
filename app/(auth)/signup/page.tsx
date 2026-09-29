import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create account - TickTock",
  description: "Create your TickTock account to start tracking focus time.",
};

export default function SignupPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <BrandMark className="size-11 rounded-xl" />
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          Create your account
        </h1>
        <p className="text-[13px] text-muted-foreground">
          A username and a password. That&apos;s it.
        </p>
      </div>

      <SignupForm />

      <p className="mt-7 text-center text-[13px] text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline underline-offset-4 hover:opacity-70"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
