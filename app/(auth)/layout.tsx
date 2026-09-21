export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full min-h-[calc(100vh-8rem)] items-center justify-center py-8">
      {children}
    </div>
  );
}