import { Header } from '@/components/landing/header';
import { Footer } from '@/components/landing/footer';

export const metadata = {
  title: 'Eliminar cuenta — NauticApp',
  description: 'Cómo solicitar la eliminación de tu cuenta y datos personales en NauticApp.',
};

export default function EliminarCuentaPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="mb-4 text-2xl font-bold text-gray-900">Eliminar tu cuenta</h1>
        <p className="mb-8 text-gray-600">
          Si querés eliminar tu cuenta de NauticApp y todos los datos asociados, seguí los pasos a
          continuación.
        </p>

        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold text-gray-800">¿Cómo solicitarlo?</h2>
          <p className="mb-4 text-gray-600">
            Enviá un email a{' '}
            <a href="mailto:hola@nauticapp.club" className="text-teal-700 underline">
              hola@nauticapp.club
            </a>{' '}
            con el asunto <strong>&quot;Solicitud de eliminación de cuenta&quot;</strong> desde el
            email con el que te registraste.
          </p>
          <p className="text-gray-600">
            Procesamos la solicitud dentro de los <strong>7 días hábiles</strong> siguientes a la
            recepción del correo.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold text-gray-800">¿Qué datos se eliminan?</h2>
          <ul className="list-inside list-disc space-y-1 text-gray-600">
            <li>Tu perfil (nombre, apellido, teléfono, foto)</li>
            <li>Tu historial de salidas e invitados</li>
            <li>Tus publicaciones en el marketplace</li>
            <li>Tus tokens de notificación push</li>
            <li>Tu cuenta de acceso (email y contraseña)</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold text-gray-800">Datos que pueden retenerse</h2>
          <p className="text-gray-600">
            Algunos datos pueden conservarse por obligaciones legales o para la seguridad del
            servicio, como registros de acceso requeridos por regulaciones argentinas aplicables.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
