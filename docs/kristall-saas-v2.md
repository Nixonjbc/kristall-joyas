# Kristall Joyas SaaS — etapa técnica de pruebas

## Estado al 26 de octubre de 2026

Rama `saas/online-v2`. La aplicación v1.32 en la raíz permanece intacta.
La versión nueva está en `saas/`. Se publicó exclusivamente en un sitio privado separado:
https://kristall-joyas-saas-pruebas.hearty-olive-7420.chatgpt.site

Site ID: `appgprj_6adee8679d188191a6b345a8877250fe`.
Su checkout independiente es `/workspace/sites/kristall-saas-trial` y su manifiesto conserva ese ID. No crear otro Site para actualizarlo.

La migración `kristall_online_saas_v2` está aplicada al proyecto real `ngueptnrldrtlxvohsif`. La clave publicable está configurada. No se modificó la aplicación v1.32, no se activó la licencia de Kristall y no se migraron datos.

La cuenta propietaria aún debe crearse y confirmar su correo mediante Auth. No asignar administración a una cuenta basándose solo en ser la primera registrada: verificar con el propietario el correo exacto. Después se insertará su UUID confirmado en `kristall_private.admins`, sin cambiar la licencia real. La aplicación exige TOTP/MFA para administrar.

## Decisión vigente

100 % online. Supabase Auth con correo y contraseña; sesión solo en memoria. Sin IndexedDB, localStorage financiero, cola, sincronización diferida ni service worker en la nueva aplicación. Recargar requiere iniciar sesión de nuevo. Instalación PWA opcional mediante el manifiesto, sujeta al navegador.

La nueva aplicación deberá desplegarse en un **origen independiente**. No probarla bajo el GitHub Pages actual: su service worker anterior tiene alcance sobre ese origen y puede interceptar rutas nuevas. No modificar ni desregistrar ese worker desde la versión nueva.

## Datos y permisos

La migración aditiva `supabase/migrations/202610260001_online.sql` usa el esquema de licencias existente. No cambia estados ni agrega membresías reales automáticamente.

Tablas financieras en esquema privado, con RLS y sin permisos de acceso directo para anon/authenticated. Las RPC públicas son SECURITY INVOKER y llaman implementaciones SECURITY DEFINER en esquema no expuesto, con permisos de ejecución limitados. Todas validan sesión real existente en auth.sessions y usuario no eliminado ni bloqueado. Solo RPC específicas autenticadas pueden acceder. Cada RPC financiera valida usuario, membresía activa, producto, estado de licencia, revocación y fecha del servidor (America/Caracas). No se usa la hora del teléfono para autorizar.

El primer almacenamiento transaccional es un documento JSON por negocio, bloqueado durante cada escritura. Incluye versión optimista e identificador de solicitud. Es apropiado para la prueba inicial y volúmenes pequeños; antes de escalar deben medirse tamaño, latencia y coste de las instantáneas y pasar a tablas normalizadas/paginación si procede.

El servidor usa un contador monotónico que no retrocede con restauraciones, evitando reutilizar números de comprobante. Genera marcas temporales y auditoría de correcciones. Valida importes con precisión decimal, referencias, duplicados, fechas y saldo histórico nunca negativo. No existe escritura genérica de una base enviada por el navegador.

Clientes, ventas a crédito, abonos, datos de prendas, métodos de pago, calendario, historiales, correcciones y comprobantes reutilizan la interfaz existente. El cliente calcula la presentación del historial sobre la instantánea confirmada por el servidor. Cada modificación se confirma mediante transacción antes de mostrar éxito.

Si se pierde la respuesta de una escritura, se bloquean operaciones nuevas y se permite verificar repitiendo el mismo identificador. No se encolan operaciones para ejecutarlas automáticamente después.

## Licencias y administración

15 USD/mes por joyería. Cuenta administradora explícita en esquema privado y JWT con MFA `aal2`. La interfaz permite configurar TOTP, listar licencias y confirmar manualmente estado, vigencia, pago y motivo. No hay cobros automáticos. El pago y su auditoría se escriben en la misma transacción; los reintentos conservan el identificador de la confirmación.

La creación de una nueva joyería exige una cuenta con correo previamente confirmado; crea negocio vacío y licencia pendiente. Crear cuentas y asociar el primer negocio existente se resolverá con el acceso administrativo real. No hay autoasignación de privilegios desde metadatos del usuario.

## Respaldos y recuperación

Cada cambio conserva en el servidor estados anterior y posterior con actor, fecha, acción, versión e identificador. La interfaz lista los 50 puntos recientes y permite restaurar un punto del mismo negocio con confirmación, generando otra versión. Descarga JSON a petición desde una lectura reciente al servidor. No permite importar los respaldos locales antiguos: eso sería una migración que requiere autorización.

Estos puntos no sustituyen respaldos externos ni recuperación ante pérdida del proyecto. Pendiente verificar plan de Supabase, disponibilidad de backups/PITR, retención, exportación externa y un ensayo real de recuperación antes de producción. No se afirma que ya estén configurados.

## Validación realizada

- 27 pruebas sobre PostgreSQL aislado con PGlite: permisos directos, aislamiento entre negocios, licencias pendientes/suspendidas/vencidas, acceso anónimo, MFA, precisión monetaria, serial servidor, pagos excesivos, saldo histórico, conflictos de versión, corrección y rollback, auditoría, reintentos y restauración ajena/inexistente, restauración válida, renovación manual idempotente, creación de negocio pendiente, no reutilización de seriales, no reutilización de ID con datos distintos y revocación inmediata de sesión.
- 5 pruebas del transporte: confirmación servidor, bloqueo por resultado incierto, reintento con mismo ID, bloqueo sin internet y ausencia de almacenamiento financiero/offline.
- Sintaxis JavaScript válida.
- 11 comprobaciones adicionales en PostgreSQL real mediante `tests/supabase-rollback.sql`: todas las cuentas, sesiones, negocios, licencias y movimientos ficticios se revirtieron al terminar.
- API HTTP real: Auth habilitado y registro permitido; RPC y tablas de licencias rechazan solicitudes anónimas con 401.
- Pantallas de acceso y registro revisadas en navegador. El sitio publicado exige acceso privado con ChatGPT antes del acceso de Supabase.
- Archivos de la aplicación original sin diferencias respecto de main.

Pendiente: validar cuenta y sesión reales de Supabase Auth, TOTP/MFA y los flujos financieros completos en móvil con una joyería de prueba separada. Los ensayos SQL no sustituyen el inicio de sesión mediante el servicio Auth. Confirmar configuración de redirecciones de correo y SMTP, concurrencia HTTP y backups externos antes de producción. La integración conectada no ofrece cambios de configuración Auth/SMTP/PITR; no afirmar que estén configurados.

El asesor de seguridad ya no devuelve advertencias de funciones privilegiadas expuestas. Solo informa RLS sin políticas, intencional en tablas que no admiten acceso directo. El asesor de rendimiento señala índices faltantes en las tres tablas de licencias heredadas; no son problemas de aislamiento y se pueden añadir sin tocar datos.

## Alta inicial y continuidad

El siguiente paso indispensable del propietario es abrir la URL privada, crear su cuenta con una contraseña propia, confirmar el correo e indicar únicamente el correo utilizado. No pedir contraseña ni códigos por chat. Después verificar `auth.users.email_confirmed_at` y asignar administración exclusivamente a esa cuenta con autorización del propietario; no activar la licencia del primer cliente.

El registro usa el correo transaccional de Supabase. Confirmar la configuración de las URLs permitidas en Auth: la integración no expone edición de esa configuración. Si una confirmación termina redirigiendo a localhost, comprobar que el correo quedó verificado y volver a la URL privada; corregir la redirección en el panel antes del lanzamiento.

Una propuesta de auxiliar público privilegiado para crear cuentas ficticias fue rechazada por la revisión automática de seguridad y **no se desplegó**. No reintentarlo por otra vía. Se sustituyó por pruebas transaccionales con rollback y el registro normal del propietario.

No hay aún cuentas reales ni negocio de prueba persistente. Al terminar las comprobaciones de esta etapa: una sola joyería (Kristall), licencia pending de 1500 centavos, paid_through null, cero usuarios y cero eventos financieros. No afirmar que el inicio de sesión extremo a extremo ni la prueba móvil financiera ya se completaron.
