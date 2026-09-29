export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The navbar returns null on auth routes, so there is no header height to
  // subtract here — the form just centres in whatever the page gives it.
  return (
    <div className="flex w-full min-h-[70vh] items-center justify-center">
      {children}
    </div>
  );
}
