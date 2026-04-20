'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { login, type ActionResult } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(login, null);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Ingresar</CardTitle>
          <CardDescription>Accedé a tu guardería náutica</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
              {state?.fieldErrors?.email && (
                <p className="text-destructive text-sm">{state.fieldErrors.email[0]}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" name="password" type="password" required />
              {state?.fieldErrors?.password && (
                <p className="text-destructive text-sm">{state.fieldErrors.password[0]}</p>
              )}
            </div>
            {state?.error && <p className="text-destructive text-sm">{state.error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? 'Ingresando...' : 'Ingresar'}
            </Button>
            <p className="text-muted-foreground text-center text-sm">
              ¿No tenés cuenta?{' '}
              <Link href="/signup" className="underline">
                Registrate
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
