import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

type Props = { searchParams: Promise<{ token?: string }> };

export default async function AcceptInvitePage({ searchParams }: Props) {
  const { token } = await searchParams;
  if (!token) redirect('/login');

  const admin = createAdminClient();

  // Buscar la invitación con service_role (bypass RLS).
  const { data: invitation } = await admin
    .from('invitations')
    .select('*, marina:marinas(name, slug)')
    .eq('token', token)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invitación inválida</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4 text-sm">
              El enlace expiró o ya fue utilizado.
            </p>
            <Link href="/login">
              <Button>Ir al login</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const user = await getCurrentUser();

  // Si no está logueado, redirigir a signup con email prefijado.
  if (!user) {
    redirect(`/signup?invite=${token}&email=${encodeURIComponent(invitation.email)}`);
  }

  // Si el email no coincide, informar.
  if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Email no coincide</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              Esta invitación es para <strong>{invitation.email}</strong>, pero estás logueado como{' '}
              <strong>{user.email}</strong>. Cerrá sesión e ingresá con el email correcto.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Todo OK: aceptar invitación via función RPC.
  const { error } = await admin.rpc('accept_invitation', {
    p_token: token,
    p_user_id: user.id,
  });

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Error al aceptar invitación</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive text-sm">{error.message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  redirect('/dashboard?joined=1');
}
