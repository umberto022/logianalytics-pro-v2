import type { Metadata } from "next";
import Link from "next/link";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";
import { LEGAL_OWNER_NAME, CONTACT_EMAIL, LEGAL_JURISDICTION } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Términos y Condiciones — LogiAnalytics Pro",
  description: "Términos y condiciones de uso de la plataforma LogiAnalytics Pro.",
};

export default function TerminosPage() {
  return (
    <LegalLayout title="Términos y Condiciones">
      <LegalSection title="1. Quiénes somos">
        <p>
          LogiAnalytics Pro es una plataforma de gestión de inventario, ventas, compras y
          rentabilidad, operada por <strong>{LEGAL_OWNER_NAME}</strong> ({LEGAL_JURISDICTION}),
          en adelante &quot;nosotros&quot; o &quot;el proveedor&quot;. Estos Términos y Condiciones
          (&quot;Términos&quot;) rigen el uso de la plataforma por parte de cualquier persona o
          empresa que cree una cuenta (&quot;el usuario&quot; o &quot;la empresa&quot;).
        </p>
      </LegalSection>

      <LegalSection title="2. Aceptación de los términos">
        <p>
          Al crear una cuenta, acceder o usar LogiAnalytics Pro aceptas estos Términos y nuestra{" "}
          <Link href="/privacidad" className="text-brand-600 hover:underline">Política de Privacidad</Link>.
          Si estás creando la cuenta en representación de una empresa, declaras tener autoridad
          para vincularla a estos Términos.
        </p>
      </LegalSection>

      <LegalSection title="3. Descripción del servicio">
        <p>
          LogiAnalytics Pro provee herramientas para registrar y consultar inventario, ventas,
          compras, clientes, proveedores, rutas de distribución y reportes de rentabilidad,
          accesibles vía navegador web y como aplicación web instalable (PWA). El servicio se
          contrata y se pone en marcha de forma directa con el proveedor — la instalación,
          capacitación inicial y condiciones comerciales (precio, forma de pago, alcance) se
          acuerdan individualmente con cada empresa, fuera de esta plataforma, y no mediante
          compra o suscripción en línea.
        </p>
      </LegalSection>

      <LegalSection title="4. Cuentas y responsabilidad del usuario">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>El usuario es responsable de mantener la confidencialidad de sus credenciales de acceso.</li>
          <li>El usuario es responsable de la exactitud de los datos que ingresa a la plataforma.</li>
          <li>Cuando una empresa tiene varios usuarios (roles de Admin, Ventas, Compras, Logística), el Admin de la empresa es responsable de administrar quién tiene acceso y con qué permisos.</li>
          <li>Nos reservamos el derecho de suspender una cuenta ante uso indebido, fraude, o incumplimiento de estos Términos.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Uso aceptable">
        <p>No está permitido usar la plataforma para:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Actividades ilegales o que infrinjan derechos de terceros.</li>
          <li>Intentar acceder a datos de otra empresa/workspace sin autorización.</li>
          <li>Interferir con el funcionamiento normal del servicio (ataques, scraping masivo, ingeniería inversa con fines maliciosos).</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Propiedad de los datos">
        <p>
          Los datos que cada empresa ingresa a LogiAnalytics Pro (inventario, ventas, clientes,
          proveedores, etc.) son propiedad exclusiva de esa empresa. Los usamos únicamente para
          prestar el servicio — no vendemos ni compartimos esos datos con terceros para fines
          comerciales ajenos a la plataforma. Más detalle en la{" "}
          <Link href="/privacidad" className="text-brand-600 hover:underline">Política de Privacidad</Link>.
        </p>
      </LegalSection>

      <LegalSection title="7. Disponibilidad del servicio">
        <p>
          LogiAnalytics Pro se ofrece &quot;tal cual&quot; (&quot;as is&quot;). Hacemos un esfuerzo
          razonable por mantener el servicio disponible y los datos respaldados (la infraestructura
          corre sobre Firebase/Google Cloud), pero no garantizamos disponibilidad ininterrumpida ni
          ausencia total de errores. Recomendamos exportar reportes periódicamente (la plataforma
          incluye exportación a PDF/CSV) como respaldo adicional propio.
        </p>
      </LegalSection>

      <LegalSection title="8. Limitación de responsabilidad">
        <p>
          En la medida permitida por la ley, no seremos responsables por daños indirectos,
          pérdida de ganancias o de datos derivados del uso o la imposibilidad de uso de la
          plataforma. Nada en esta cláusula limita responsabilidad que no pueda excluirse por ley.
        </p>
      </LegalSection>

      <LegalSection title="9. Cancelación">
        <p>
          Una empresa puede solicitar la baja de su cuenta y la eliminación de sus datos en
          cualquier momento, escribiendo a {CONTACT_EMAIL}. Las condiciones comerciales de
          cancelación (si aplica algún compromiso de permanencia) son las acordadas individualmente
          al contratar el servicio.
        </p>
      </LegalSection>

      <LegalSection title="10. Cambios a estos términos">
        <p>
          Podemos actualizar estos Términos para reflejar cambios en el servicio o por
          requisitos legales. Si el cambio es significativo, lo comunicaremos a los usuarios
          activos por email o dentro de la plataforma.
        </p>
      </LegalSection>

      <LegalSection title="11. Ley aplicable">
        <p>
          Estos Términos se rigen por las leyes de {LEGAL_JURISDICTION}. Cualquier disputa se
          resolverá ante los tribunales competentes de dicho país.
        </p>
      </LegalSection>

      <LegalSection title="12. Contacto">
        <p>
          Para consultas sobre estos Términos, escribinos a{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:underline">{CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
