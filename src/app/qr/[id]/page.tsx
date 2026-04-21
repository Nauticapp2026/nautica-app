import { createAdminClient } from '@/lib/supabase/admin';
import { GuestQrView } from './guest-qr-view';

type PorteriaInfo = {
  clubName: string | null;
  socioFullName: string | null;
  socioFirstName: string | null;
  invitados: { nombre: string; cantidadAcompanantes: number }[];
  estado: string | null;
};

async function getPorteriaInfo(id: string): Promise<PorteriaInfo | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('porteria')
      .select(
        'estado, socio:socio_id(nombre, apellido), guarderia:guarderia_id(nombre), porteria_invitados(cantidad_acompanantes, invitado:invitado_id(nombre, apellido))',
      )
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    const socio = data.socio as any;
    const guarderia = data.guarderia as any;
    const rows = (data.porteria_invitados ?? []) as any[];

    const socioFirstName = socio?.nombre ?? null;
    const socioFullName = socio ? [socio.nombre, socio.apellido].filter(Boolean).join(' ') : null;

    const invitados = rows
      .map((r) => {
        const inv = Array.isArray(r.invitado) ? r.invitado[0] : r.invitado;
        const nombre = inv ? [inv.nombre, inv.apellido].filter(Boolean).join(' ') : '';
        return { nombre, cantidadAcompanantes: r.cantidad_acompanantes ?? 0 };
      })
      .filter((r) => r.nombre);

    return {
      clubName: guarderia?.nombre ?? null,
      socioFirstName,
      socioFullName,
      invitados,
      estado: data.estado ?? null,
    };
  } catch {
    return null;
  }
}

export default async function GuestQrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const info = await getPorteriaInfo(id);

  return (
    <main
      className="flex min-h-screen items-start justify-center px-4 py-6"
      style={{ background: '#175861' }}
    >
      <GuestQrView
        id={id}
        clubName={info?.clubName ?? null}
        socioFirstName={info?.socioFirstName ?? null}
        socioFullName={info?.socioFullName ?? null}
        invitados={info?.invitados ?? []}
        estado={info?.estado ?? null}
      />
    </main>
  );
}
