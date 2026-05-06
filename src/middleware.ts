import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Pre-launch gate: muro de Basic Auth para que solo personas autorizadas
// vean el sitio antes del lanzamiento público. Activado por env vars; si
// alguna falta, el gate queda desactivado (kill switch para "destrabar"
// el sitio borrando las vars en Vercel sin deploy).
const REALM = 'NauticApp';

function checkPrelaunchGate(request: NextRequest): 'ok' | 'unauthorized' | 'disabled' {
  const expectedUser = process.env.PRELAUNCH_GATE_USER;
  const expectedPass = process.env.PRELAUNCH_GATE_PASSWORD;

  if (!expectedUser || !expectedPass) return 'disabled';

  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Basic ')) return 'unauthorized';

  try {
    const decoded = atob(auth.slice(6));
    const idx = decoded.indexOf(':');
    if (idx === -1) return 'unauthorized';
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    return user === expectedUser && pass === expectedPass ? 'ok' : 'unauthorized';
  } catch {
    return 'unauthorized';
  }
}

export async function middleware(request: NextRequest) {
  // Webhooks y crons llamados desde fuera del browser tienen su propia
  // autenticación (CRON_SECRET, secret en query param). El gate de Basic
  // Auth no aplica para ellos — los rompería.
  const { pathname } = request.nextUrl;
  const isPublicAPI = pathname.startsWith('/api/cron') || pathname.startsWith('/api/webhooks');

  if (!isPublicAPI) {
    const gate = checkPrelaunchGate(request);
    if (gate === 'unauthorized') {
      return new NextResponse('Authentication required', {
        status: 401,
        headers: { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` },
      });
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match todas las rutas excepto:
     * - _next/static (assets estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico
     * - archivos con extensión (imágenes, fuentes, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
