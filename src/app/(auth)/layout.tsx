export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        background: 'linear-gradient(135deg, #1B3C4E 0%, #2D6860 55%, #4A8A70 100%)',
      }}
    >
      {children}
    </div>
  );
}
