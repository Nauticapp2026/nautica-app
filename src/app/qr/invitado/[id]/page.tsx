import { createAdminClient } from '@/lib/supabase/admin';
import { GuestInvitadoQrView } from './guest-invitado-qr-view';

type InvitadoInfo = {
  invitadoFullName: string | null;
  cantidadAcompanantes: number;
  esTecnico: boolean;
  motivoTecnico: string | null;
  socioFullName: string | null;
  clubName: string | null;
  isExpired: boolean;
};

async function getInvitadoInfo(bridgeId: string): Promise<InvitadoInfo | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('porteria_invitados')
      .select(
        'cantidad_acompanantes, es_tecnico, motivo_tecnico, invitado:invitado_id(nombre, apellido), porteria:porteria_id(estado, arribada_en, tipo, hasta, socio:socio_id(nombre, apellido), guarderia:guarderia_id(nombre))',
      )
      .eq('id', bridgeId)
      .maybeSingle();
    if (error || !data) return null;

    const inv = (Array.isArray(data.invitado) ? data.invitado[0] : data.invitado) as unknown as {
      nombre: string;
      apellido: string | null;
    } | null;
    const porteria = (Array.isArray(data.porteria)
      ? data.porteria[0]
      : data.porteria) as unknown as {
      estado: string | null;
      arribada_en: string | null;
      tipo: string | null;
      hasta: string | null;
      socio:
        | { nombre: string; apellido: string | null }
        | { nombre: string; apellido: string | null }[]
        | null;
      guarderia: { nombre: string } | { nombre: string }[] | null;
    } | null;

    const invitadoFullName = inv
      ? [inv.nombre, inv.apellido].filter(Boolean).join(' ') || inv.nombre
      : null;
    const socio = (Array.isArray(porteria?.socio) ? porteria?.socio[0] : porteria?.socio) as
      | { nombre: string; apellido: string | null }
      | null
      | undefined;
    const socioFullName = socio ? [socio.nombre, socio.apellido].filter(Boolean).join(' ') : null;
    const guarderia = (
      Array.isArray(porteria?.guarderia) ? porteria?.guarderia[0] : porteria?.guarderia
    ) as { nombre: string } | null | undefined;
    const clubName = guarderia?.nombre ?? null;

    const estado = porteria?.estado ?? null;
    const arribadaEn = porteria?.arribada_en ?? null;
    const tipo = porteria?.tipo ?? null;
    const hasta = porteria?.hasta ?? null;
    const hastaVencido =
      tipo === 'acceso_externo' && hasta ? new Date(hasta).getTime() < Date.now() : false;
    const isExpired =
      estado === 'revocado' || estado === 'usado' || arribadaEn != null || hastaVencido;

    return {
      invitadoFullName,
      cantidadAcompanantes: data.cantidad_acompanantes ?? 0,
      esTecnico: !!data.es_tecnico,
      motivoTecnico: (data.motivo_tecnico as string | null) ?? null,
      socioFullName,
      clubName,
      isExpired,
    };
  } catch {
    return null;
  }
}

export default async function GuestInvitadoQrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const info = await getInvitadoInfo(id);

  return (
    <main
      className="flex min-h-screen items-start justify-center px-4 py-6"
      style={{ background: '#175861' }}
    >
      <GuestInvitadoQrView
        id={id}
        invitadoFullName={info?.invitadoFullName ?? null}
        cantidadAcompanantes={info?.cantidadAcompanantes ?? 0}
        esTecnico={info?.esTecnico ?? false}
        motivoTecnico={info?.motivoTecnico ?? null}
        socioFullName={info?.socioFullName ?? null}
        clubName={info?.clubName ?? null}
        isExpired={info?.isExpired ?? false}
      />
    </main>
  );
}
