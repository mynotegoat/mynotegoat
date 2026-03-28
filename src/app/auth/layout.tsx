export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-[var(--bg-app)] p-4 lg:p-8">
      <div className="mx-auto max-w-[520px] rounded-[26px] border border-white/70 bg-white/75 p-6 shadow-[0_20px_50px_rgba(16,38,58,0.12)] backdrop-blur-sm lg:p-8">
        {children}
      </div>
    </div>
  );
}
