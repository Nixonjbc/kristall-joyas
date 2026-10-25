# Sistema central de licencias — diseño de implementación

## Ramas
- joyerias: motor común de créditos y abonos; primer negocio: kristall-joyas.
- editorial-maestro: reservado; no implementar todavía.

## Separación por negocio
- product_id, business_id, license_id, installation_id.
- Branding por negocio (nombre, logo, colores, tipografía) separado del motor funcional.
- Datos de clientes y movimientos permanecen en la instalación local del negocio; nunca en la base de licencias.
- Actualizaciones del motor compartido deben preservar branding y datos y pasar pruebas por negocio.

## Estados
- active: puede operar dentro del período autorizado.
- suspended: impago después del día 5.
- revoked: revocación manual; solo el administrador puede reversar.
- Revocar y reversar no borran datos; renovar un pago no reversa revocaciones.

## Facturación
- Período: primer al último día de cada mes.
- Alta a mitad de mes: prorrateo por días calendario restantes, inclusive el día de alta.
- Pago manual del 1 al 5; suspensión por impago desde el día 6.
- Renovación no mueve el día de cobro.

## Activación
- Código aleatorio de un solo uso; vence en 24 horas; primera activación requiere internet.
- Un dispositivo autorizado por licencia; transferencia manual desde panel, con respaldo recomendado pero no obligatorio.
- Autorización offline hasta 72 horas desde última verificación válida, sin extender período permitido.
- Revocación al comprobarse en línea; no se puede garantizar revocación instantánea offline.
- Se requieren autorizaciones firmadas y validación de tiempo confiable; una PWA offline no es a prueba de manipulaciones.

## Panel privado
- Solo una cuenta administradora, correo, contraseña, 2FA.
- Secciones Joyerías y Editorial Maestro; en Joyerías, lista de negocios y licencias.
- Crear licencia, confirmar pago, revocar, reversar, transferir dispositivo, historial de auditoría.
- No almacenar secretos ni credenciales administrativas en GitHub Pages o JavaScript público.

## Entrega segura
- No borrar ni sobrescribir datos locales existentes al desplegar actualizaciones.
- La instalación de cliente debe empezar vacía; respaldar y verificar antes de limpiar cualquier instalación de pruebas.
- Respaldos manuales; recordatorio cada siete días, no bloqueante.

## Implementación por fases
1. Estructura y sección informativa de licencia en Configuración (v1.32).
2. Servicio real de licencias, autenticación del administrador, base de datos y panel privado.
3. Integrar activación y verificación de licencia en Kristall Joyas, con pruebas de conectividad, suspensión y revocación.
4. Entrega limpia al primer cliente y validación con datos de prueba antes de uso real.

La fase 1 no valida ni bloquea licencias. No afirmar que la activación está lista hasta probar fases 2 y 3.
