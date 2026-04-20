'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { switchMarina } from '@/app/actions/invitations';

type Membership = {
  marinaId: string;
  role: string;
  marina: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
  };
};

type Props = {
  memberships: Membership[];
  activeMarinaId: string;
};

export function MarinaSwitcher({ memberships, activeMarinaId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (memberships.length <= 1) {
    const m = memberships[0];
    return <span className="text-muted-foreground text-sm">{m?.marina.name}</span>;
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    startTransition(async () => {
      await switchMarina(id);
      router.refresh();
    });
  }

  return (
    <select
      value={activeMarinaId}
      onChange={handleChange}
      disabled={pending}
      className="bg-background rounded border px-2 py-1 text-sm"
      aria-label="Cambiar guardería"
    >
      {memberships.map((m) => (
        <option key={m.marinaId} value={m.marinaId}>
          {m.marina.name}
        </option>
      ))}
    </select>
  );
}
