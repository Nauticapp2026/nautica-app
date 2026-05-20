import { Header } from '@/components/landing/header';
import { Footer } from '@/components/landing/footer';

export const metadata = {
  title: 'Política de Privacidad — NauticApp',
  description: 'Información sobre cómo NauticApp recopila, usa y protege tus datos personales.',
};

const sections = [
  {
    title: '1. Responsable del tratamiento',
    content: `NauticApp (en adelante "la Aplicación") es operada por NauticApp, con domicilio en Ciudad Autónoma de Buenos Aires, Argentina.
Para consultas relacionadas con privacidad podés escribirnos a hola@nauticapp.com.`,
  },
  {
    title: '2. Datos que recopilamos',
    content: `Al usar NauticApp recopilamos los siguientes datos personales:
• Nombre y apellido
• Dirección de correo electrónico
• Número de teléfono
• Fotografías e imágenes que subís a la plataforma (embarcaciones, documentos, publicaciones)
• Datos de embarcaciones registradas
• Historial de salidas náuticas e invitados registrados
• Tokens de notificación push (para enviar alertas de la app)
• Dirección IP y datos técnicos del dispositivo (sistema operativo, versión de la app)
• Coordenadas del club náutico al que pertenecés (no tu ubicación personal)`,
  },
  {
    title: '3. Finalidad del tratamiento',
    content: `Usamos tus datos para:
• Brindar y mantener el servicio de gestión náutica
• Gestionar tu cuenta y membresía en el club
• Enviar notificaciones sobre el estado de tus salidas, tareas y alertas del club
• Permitir que el personal de seguridad del club verifique el acceso de invitados
• Facilitar el contacto entre usuarios del marketplace de servicios náuticos
• Cumplir con obligaciones legales vigentes en Argentina`,
  },
  {
    title: '4. Base legal',
    content: `El tratamiento de tus datos se basa en:
• Tu consentimiento al registrarte en la plataforma (Art. 5, Ley 25.326)
• La ejecución del contrato de servicio que aceptás al usar NauticApp
• El cumplimiento de obligaciones legales`,
  },
  {
    title: '5. Compartición de datos',
    content: `No vendemos ni cedemos tus datos personales a terceros con fines comerciales. Podemos compartir datos con:
• Supabase (infraestructura de base de datos y autenticación, servidores en EE. UU.) — proveedor bajo acuerdo de procesamiento de datos
• Expo / EAS (distribución de la app móvil y notificaciones push)
• Open-Meteo (pronóstico del tiempo, sin datos personales)
• Miembros de tu mismo club náutico, en la medida necesaria para operar el servicio (ej.: verificación de acceso por personal de seguridad)

Todos los proveedores cuentan con políticas de privacidad propias y están obligados contractualmente a proteger tus datos.`,
  },
  {
    title: '6. Almacenamiento y seguridad',
    content: `Tus datos se almacenan en servidores de Supabase con cifrado en tránsito (TLS) y en reposo. Implementamos controles de acceso basados en roles (RLS) a nivel de base de datos. No obstante, ningún sistema es 100% seguro; en caso de brecha de seguridad te notificaremos conforme a la normativa aplicable.`,
  },
  {
    title: '7. Plazo de conservación',
    content: `Conservamos tus datos mientras tu cuenta esté activa. Si solicitás la eliminación de tu cuenta, borraremos tus datos personales en un plazo de 30 días, salvo los que debamos conservar por obligación legal.`,
  },
  {
    title: '8. Tus derechos (Ley 25.326)',
    content: `De acuerdo con la Ley de Protección de Datos Personales N.° 25.326, tenés derecho a:
• Acceder a tus datos personales
• Rectificar datos inexactos o incompletos
• Solicitar la supresión de tus datos
• Oponerte al tratamiento en determinados casos

Para ejercer cualquiera de estos derechos, escribinos a hola@nauticapp.com indicando tu solicitud y los datos de contacto. Responderemos en el plazo legal vigente.

La DNPDP (Dirección Nacional de Protección de Datos Personales) es el organismo de control competente en Argentina.`,
  },
  {
    title: '9. Notificaciones push',
    content: `Si autorizás las notificaciones en tu dispositivo, registramos un token de notificación push generado por Expo para enviarte alertas sobre el estado de tus salidas náuticas y actividad del club. Podés revocar este permiso en cualquier momento desde la configuración de tu dispositivo.`,
  },
  {
    title: '10. Menores de edad',
    content: `NauticApp no está dirigida a menores de 13 años. No recopilamos intencionalmente datos de menores. Si tenés conocimiento de que un menor registró una cuenta, escribinos para eliminarlа.`,
  },
  {
    title: '11. Cambios a esta política',
    content: `Podemos actualizar esta política en cualquier momento. Te notificaremos mediante la app o por correo electrónico cuando los cambios sean significativos. La fecha de "última actualización" al pie indica la versión vigente.`,
  },
  {
    title: '12. Contacto',
    content: `Para cualquier consulta sobre privacidad:
📧 hola@nauticapp.com
🌐 www.nauticapp.club`,
  },
];

export default function PrivacidadPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-16 md:px-8">
        <h1 className="mb-2 text-3xl font-bold text-[#175861]">Política de Privacidad</h1>
        <p className="mb-10 text-sm text-gray-500">Última actualización: mayo de 2026</p>

        <p className="mb-8 text-gray-700">
          En NauticApp nos tomamos en serio la privacidad de nuestros usuarios. Esta política
          describe qué datos recopilamos, cómo los usamos y cuáles son tus derechos, de acuerdo con
          la Ley de Protección de Datos Personales N.° 25.326 de la República Argentina y las
          políticas de Google Play Store y Apple App Store.
        </p>

        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-3 text-lg font-semibold text-[#175861]">{section.title}</h2>
              <p className="whitespace-pre-line text-gray-700">{section.content}</p>
            </section>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
