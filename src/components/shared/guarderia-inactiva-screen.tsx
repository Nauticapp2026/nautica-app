import { logout } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function GuarderiaInactivaScreen({ guarderiaNombre }: { guarderiaNombre: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Tu guardería está pendiente de activación</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            La guardería <span className="font-semibold text-[#175861]">{guarderiaNombre}</span>{' '}
            todavía no fue activada por la plataforma. En cuanto el administrador de NauticaApp la
            habilite, vas a poder ingresar al dashboard con normalidad.
          </p>
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
