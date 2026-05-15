import { getVersionVigente } from '@/lib/auth/terminos';
import { MarkdownView } from '@/components/shared/markdown-view';

export const dynamic = 'force-dynamic';

const TZ_AR = 'America/Argentina/Buenos_Aires';

function formatFecha(d: Date) {
  return d.toLocaleDateString('es-AR', {
    timeZone: TZ_AR,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default async function TerminosPublicosPage() {
  const vigente = await getVersionVigente();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {vigente ? (
        <>
          <p className="text-muted-foreground mb-6 text-xs">
            Versión {vigente.version} · publicada el {formatFecha(vigente.publicadoEn)}
          </p>
          <MarkdownView source={vigente.contenido} />
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Todavía no hay términos publicados.</p>
      )}
    </div>
  );
}
