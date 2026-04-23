import { createAdminClient } from '@/lib/supabase/admin';
import { GuestQrView } from './guest-qr-view';

type PorteriaInfo = {
  clubName: string | null;
  socioFullName: string | null;
  socioFirstName: string | null;
  estado: string | null;
  arribadaEn: string | null;
};

async function getPorteriaInfo(id: string): Promise<PorteriaInfo | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('porteria')
      .select(
        'estado, arribada_en, socio:socio_id(nombre, apellido), guarderia:guarderia_id(nombre)',
      )
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    const socio = (Array.isArray(data.socio) ? data.socio[0] : data.socio) as {
      nombre: string;
      apellido: string | null;
    } | null;
    const guarderia = (Array.isArray(data.guarderia) ? data.guarderia[0] : data.guarderia) as {
      nombre: string;
    } | null;

    const socioFirstName = socio?.nombre ?? null;
    const socioFullName = socio ? [socio.nombre, socio.apellido].filter(Boolean).join(' ') : null;

    return {
      clubName: guarderia?.nombre ?? null,
      socioFirstName,
      socioFullName,
      estado: data.estado ?? null,
      arribadaEn: (data.arribada_en as string | null) ?? null,
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
        estado={info?.estado ?? null}
        arribadaEn={info?.arribadaEn ?? null}
      />
    </main>
  );
}
