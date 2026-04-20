import { getActiveMarina } from '@/lib/auth/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function DashboardPage() {
  const ctx = await getActiveMarina();
  if (!ctx) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hola, {ctx.profile.fullName ?? ctx.profile.email}</h1>
        <p className="text-muted-foreground">
          Estás en <strong>{ctx.activeMarina.name}</strong> como{' '}
          <strong>{ctx.activeMembership.role}</strong>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Espacios</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
            <p className="text-muted-foreground text-xs">Fase 2</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Facturas pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
            <p className="text-muted-foreground text-xs">Fase 3</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Tareas abiertas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">—</p>
            <p className="text-muted-foreground text-xs">Fase 5</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
