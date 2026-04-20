export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        background: 'linear-gradient(180deg, #175861 0%, #669E9D 60%, #ABC2B3 100%)',
      }}
    >
      {children}
    </div>
  );
}
