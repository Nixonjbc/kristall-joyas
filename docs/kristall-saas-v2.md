# Kristall Joyas SaaS — etapa técnica de pruebas

## Estado al 26 de octubre de 2026

Rama `saas/online-v2`. La aplicación v1.32 en la raíz permanece intacta.
La versión nueva está en `saas/`. No se ha publicado, aplicado esta migración al proyecto real, activado ninguna licencia real ni importado datos.

El entorno real sigue pendiente de conexión autorizada a Supabase. El ID de proyecto por sí solo no concede acceso administrativo ni permite obtener la clave pública. `saas/config.js` queda cerrado por defecto hasta configurar la clave publicable legítima del proyecto. Nunca usar service_role en el navegador.

## Decisión vigente

100 % online. Supabase Auth con correo y contraseña; sesión solo en memoria. Sin IndexedDB, localStorage financiero, cola, sincronización diferida ni service worker en la nueva aplicación. Recargar requiere iniciar sesión de nuevo. Instalación PWA opcional mediante el manifiesto, sujeta al navegador.

La nueva aplicación deberá desplegarse en un **origen independiente**. No probarla bajo el GitHub Pages actual: su service worker anterior tiene alcance sobre ese origen y puede interceptar rutas nuevas. No modificar ni desregistrar ese worker desde la versión nueva.

## Datos y permisos

La migración aditiva `supabase/migrations/202610260001_online.sql` usa el esquema de licencias existente. No cambia estados ni agrega membresías reales automáticamente.

Tablas financieras en esquema privado, con RLS y sin permisos de acceso directo para anon/authenticated. Solo RPC específicas autenticadas pueden acceder. Cada RPC financiera valida usuario, membresía activa, producto, estado de licencia, revocación y fecha del servidor (America/Caracas). No se usa la hora del teléfono para autorizar.

El primer almacenamiento transaccional es un documento JSON por negocio, bloqueado durante cada escritura. Incluye versión optimista e identificador de solicitud. Es apropiado para la prueba inicial y volúmenes pequeños; antes de escalar deben medirse tamaño, latencia y coste de las instantáneas y pasar a tablas normalizadas/paginación si procede.

El servidor genera números de comprobante, marcas temporales y auditoría de correcciones. Valida importes con precisión decimal, referencias, duplicados, fechas y saldo histórico nunca negativo. No existe escritura genérica de una base enviada por el navegador.

Clientes, ventas a crédito, abonos, datos de prendas, métodos de pago, calendario, historiales, correcciones y comprobantes reutilizan la interfaz existente. El cliente calcula la presentación del historial sobre la instantánea confirmada por el servidor. Cada modificación se confirma mediante transacción antes de mostrar éxito.

Si se pierde la respuesta de una escritura, se bloquean operaciones nuevas y se permite verificar repitiendo el mismo identificador. No se encolan operaciones para ejecutarlas automáticamente después.

## Licencias y administración

15 USD/mes por joyería. Cuenta administradora explícita en esquema privado y JWT con MFA `aal2`. La interfaz permite configurar TOTP, listar licencias y confirmar manualmente estado, vigencia, pago y motivo. No hay cobros automáticos. El pago y su auditoría se escriben en la misma transacción; los reintentos conservan el identificador de la confirmación.

La creación de una nueva joyería exige una cuenta con correo previamente confirmado; crea negocio vacío y licencia pendiente. Crear cuentas y asociar el primer negocio existente se resolverá con el acceso administrativo real. No hay autoasignación de privilegios desde metadatos del usuario.

## Respaldos y recuperación

Cada cambio conserva en el servidor estados anterior y posterior con actor, fecha, acción, versión e identificador. La interfaz lista los 50 puntos recientes y permite restaurar un punto del mismo negocio con confirmación, generando otra versión. Descarga JSON a petición desde una lectura reciente al servidor. No permite importar los respaldos locales antiguos: eso sería una migración que requiere autorización.

Estos puntos no sustituyen respaldos externos ni recuperación ante pérdida del proyecto. Pendiente verificar plan de Supabase, disponibilidad de backups/PITR, retención, exportación externa y un ensayo real de recuperación antes de producción. No se afirma que ya estén configurados.

## Validación realizada

- 24 pruebas sobre PostgreSQL aislado con PGlite: permisos directos, aislamiento entre negocios, licencias pendientes/suspendidas/vencidas, acceso anónimo, MFA, precisión monetaria, serial servidor, pagos excesivos, saldo histórico, conflictos de versión, corrección y rollback, auditoría, reintentos y restauración ajena/inexistente, restauración válida, renovación manual idempotente y creación de negocio pendiente.
- 5 pruebas del transporte: confirmación servidor, bloqueo por resultado incierto, reintento con mismo ID, bloqueo sin internet y ausencia de almacenamiento financiero/offline.
- Sintaxis JavaScript válida.
- Pantalla de acceso verificada en navegador; muestra explícitamente que falta conectar Supabase.
- Archivos de la aplicación original sin diferencias respecto de main.

Pendiente: probar contra Supabase Auth/PostgREST reales; revisar las funciones y políticas que ya existen en el proyecto; validar sesión/MFA y alta de cuentas; probar flujos completos, exportación y comprobantes en móvil; ensayar concurrencia real; confirmar respaldos operativos; desplegar en URL independiente. No entregar como producción hasta completar estas comprobaciones.

## Continuación sin SQL manual del propietario

Conectar Supabase en ChatGPT y autorizar el proyecto `ngueptnrldrtlxvohsif`. Después el agente puede inspeccionar el esquema real, ajustar y aplicar la migración, obtener solo la clave pública para la interfaz y preparar cuentas de prueba separadas. Mantener intactas la licencia pendiente del primer cliente y sus datos. Verificar el correo propietario antes de otorgarle administración; la configuración del autenticador requiere intervención del propietario.
