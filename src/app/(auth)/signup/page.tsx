'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signup, type ActionResult } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function SignupPage() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(signup, null);

  const success = state && !state.error && !state.fieldErrors;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Crear cuenta</CardTitle>
          <CardDescription>Registrate para acceder a tu guardería</CardDescription>
        </CardHeader>
        <CardContent>
          {success ? (
            <div className="space-y-2">
              <p className="text-sm">
                Te enviamos un email para confirmar tu cuenta. Revisá tu casilla.
              </p>
              <Link href="/login" className="text-sm underline">
                Volver al login
              </Link>
            </div>
          ) : (
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nombre completo</Label>
                <Input id="fullName" name="fullName" required />
                {state?.fieldErrors?.fullName && (
                  <p className="text-destructive text-sm">{state.fieldErrors.fullName[0]}</p>
                )}
              </div>
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
                {pending ? 'Creando...' : 'Crear cuenta'}
              </Button>
              <p className="text-muted-foreground text-center text-sm">
                ¿Ya tenés cuenta?{' '}
                <Link href="/login" className="underline">
                  Ingresá
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
