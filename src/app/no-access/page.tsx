import { logout } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getUserContext } from '@/lib/auth/session';

export default async function NoAccessPage() {
  const ctx = await getUserContext();
  const hasMembership = Boolean(ctx && ctx.memberships.length > 0);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sin acceso al dashboard web</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {hasMembership ? (
            <p className="text-muted-foreground text-sm">
              Tu rol no tiene acceso al dashboard web. Si sos socio o invitado, descargá la app
              mobile para operar desde tu celular. Si creés que es un error, contactá al
              administrador de tu guardería.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Tu cuenta está creada, pero todavía no pertenecés a ninguna guardería. Esperá a
              recibir una invitación por email.
            </p>
          )}
          <form action={logout}>
            <Button type="submit" variant="outline">
              Cerrar sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
