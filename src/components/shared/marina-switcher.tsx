'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { switchGuarderia } from '@/app/actions/invitations';

type Membership = {
  guarderiaId: string;
  rol: string;
  guarderia: {
    id: string;
    nombre: string;
    slug: string;
    logoUrl: string | null;
  };
};

type Props = {
  memberships: Membership[];
  activeGuarderiaId: string;
};

export function MarinaSwitcher({ memberships, activeGuarderiaId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (memberships.length <= 1) {
    const m = memberships[0];
    return <span className="text-muted-foreground text-sm">{m?.guarderia.nombre}</span>;
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    startTransition(async () => {
      await switchGuarderia(id);
      router.refresh();
    });
  }

  return (
    <select
      value={activeGuarderiaId}
      onChange={handleChange}
      disabled={pending}
      className="bg-background rounded border px-2 py-1 text-sm"
      aria-label="Cambiar guardería"
    >
      {memberships.map((m) => (
        <option key={m.guarderiaId} value={m.guarderiaId}>
          {m.guarderia.nombre}
        </option>
      ))}
    </select>
  );
}
