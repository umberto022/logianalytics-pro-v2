import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";
import { LEGAL_OWNER_NAME, CONTACT_EMAIL, LEGAL_JURISDICTION } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de Privacidad — LogiAnalytics Pro",
  description: "Cómo LogiAnalytics Pro recopila, usa y protege tus datos.",
};

export default function PrivacidadPage() {
  return (
    <LegalLayout title="Política de Privacidad">
      <LegalSection title="1. Responsable de los datos">
        <p>
          <strong>{LEGAL_OWNER_NAME}</strong> ({LEGAL_JURISDICTION}) es responsable del
          tratamiento de los datos recopilados a través de LogiAnalytics Pro.
        </p>
      </LegalSection>

      <LegalSection title="2. Qué datos recopilamos">
        <p><strong>Datos de cuenta</strong> — al registrarte: nombre completo, email, teléfono (opcional), foto de perfil (opcional).</p>
        <p><strong>Datos del negocio</strong> — lo que vos y tu equipo cargan al usar la plataforma: productos e inventario, ventas, clientes, proveedores, órdenes de compra, rutas de distribución, insumos/producción, y los reportes derivados de esos datos.</p>
        <p><strong>Datos técnicos</strong> — dirección IP, tipo de dispositivo/navegador y logs de uso, con fines de seguridad y diagnóstico.</p>
        <p><strong>Notificaciones</strong> — si activás alertas de stock, guardamos un token de tu dispositivo (Firebase Cloud Messaging) para poder enviarte avisos push.</p>
      </LegalSection>

      <LegalSection title="3. Para qué usamos tus datos">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Operar la plataforma: mostrar tu inventario, ventas, dashboards y reportes.</li>
          <li>Enviarte notificaciones que vos activaste (stock crítico, reportes por email).</li>
          <li>Dar soporte cuando nos escribís.</li>
          <li>Mejorar el producto (a partir del feedback que enviás desde la plataforma).</li>
          <li>Seguridad: detectar accesos indebidos, mantener un registro de auditoría de acciones dentro de tu empresa/workspace.</li>
        </ul>
        <p>No usamos tus datos de negocio para entrenar modelos de terceros ni los vendemos a nadie.</p>
      </LegalSection>

      <LegalSection title="4. Con quién compartimos datos">
        <p>
          No vendemos tus datos. Los compartimos únicamente con los proveedores de
          infraestructura que hacen posible el servicio, bajo sus propias políticas de
          seguridad:
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Google Firebase / Google Cloud</strong> — autenticación, base de datos (Firestore) y hosting de archivos.</li>
          <li><strong>Vercel</strong> — hosting de la aplicación web.</li>
          <li><strong>Cloudinary</strong> — almacenamiento de fotos de productos y de perfil.</li>
          <li><strong>Resend</strong> — envío de reportes por email (cuando el usuario los activa).</li>
        </ul>
        <p>
          Estos proveedores pueden procesar datos en servidores fuera de {LEGAL_JURISDICTION}{" "}
          (Firebase/Google Cloud opera con infraestructura internacional). Solo pueden usar los
          datos para prestarnos el servicio contratado, no para fines propios.
        </p>
      </LegalSection>

      <LegalSection title="5. Dentro de tu empresa (workspace)">
        <p>
          Si tu empresa tiene varios usuarios, los datos de negocio son visibles según el rol de
          cada uno (Admin, Ventas, Compras, Logística) — cada rol ve solo lo que necesita para su
          función. El detalle de qué ve cada rol está reflejado en los permisos de la plataforma.
        </p>
      </LegalSection>

      <LegalSection title="6. Almacenamiento local en tu dispositivo">
        <p>
          Guardamos algunas preferencias en el almacenamiento local de tu navegador (modo
          claro/oscuro, si activaste notificaciones). Si usás el selector rápido de cuentas,
          guardamos localmente tu nombre, email y foto para que sea más rápido volver a entrar —{" "}
          <strong>nunca guardamos contraseñas ahí</strong>. Podés borrar esta información
          quitando la cuenta desde esa pantalla o limpiando los datos del sitio en tu navegador.
        </p>
      </LegalSection>

      <LegalSection title="7. Seguridad">
        <p>
          El acceso a los datos está protegido por autenticación (Firebase Auth) y reglas de
          seguridad a nivel de base de datos que restringen cada lectura/escritura según la
          empresa y el rol del usuario que hace la petición — nadie fuera de tu empresa puede
          leer tus datos a través de la plataforma.
        </p>
      </LegalSection>

      <LegalSection title="8. Cuánto tiempo conservamos tus datos">
        <p>
          Conservamos tus datos mientras tu cuenta esté activa. Si pedís la baja, eliminamos tus
          datos de negocio en un plazo razonable, salvo que debamos conservar algún registro por
          obligación legal o contable.
        </p>
      </LegalSection>

      <LegalSection title="9. Tus derechos">
        <p>
          Podés pedirnos en cualquier momento: acceder a tus datos, corregirlos, exportarlos
          (la plataforma también permite exportar a PDF/CSV vos mismo), o eliminarlos.
          Escribinos a{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:underline">{CONTACT_EMAIL}</a>{" "}
          y lo resolvemos directamente.
        </p>
      </LegalSection>

      <LegalSection title="10. Menores de edad">
        <p>LogiAnalytics Pro está pensado para uso empresarial y no está dirigido a menores de edad.</p>
      </LegalSection>

      <LegalSection title="11. Cambios a esta política">
        <p>
          Si hacemos cambios importantes a esta política, avisamos a los usuarios activos por
          email o dentro de la plataforma.
        </p>
      </LegalSection>

      <LegalSection title="12. Contacto">
        <p>
          Para cualquier consulta sobre privacidad, escribinos a{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:underline">{CONTACT_EMAIL}</a>.
          Ver también nuestros{" "}
          <Link href="/terminos" className="text-brand-600 hover:underline">Términos y Condiciones</Link>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
