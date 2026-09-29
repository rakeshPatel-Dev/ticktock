import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in - TickTock",
  description: "Sign in to your TickTock account.",
};

/**
 * No card. A sign-in form is three fields; wrapping it in a bordered, elevated
 * panel put a box on the page that the eye had to resolve before it could read
 * the form. The form is the page.
 */
export default function LoginPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <BrandMark className="size-11 rounded-xl" />
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
          Welcome back
        </h1>
        <p className="text-[13px] text-muted-foreground">
          Sign in to pick up where you left off.
        </p>
      </div>

      <LoginForm />

      <p className="mt-7 text-center text-[13px] text-muted-foreground">
        New here?{" "}
        <Link
          href="/signup"
          className="font-medium text-foreground underline underline-offset-4 hover:opacity-70"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
