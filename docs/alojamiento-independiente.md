# Alojamiento independiente de Joyerías

Preparación solicitada para retirar la dependencia de ChatGPT Sites. No es una migración de base de datos.

- Proyecto de datos y autenticación: Supabase `ngueptnrldrtlxvohsif`, sin cambios.
- Interfaz a publicar: `saas/`, rama `saas/online-v2` de `Nixonjbc/kristall-joyas`.
- Destino propuesto: Render Static Site. `render.yaml` contiene la definición, sin secretos ni cobros configurados. Publicación automática desactivada.
- La raíz del repositorio y GitHub Pages quedan intactos.
- No desplegar el repositorio completo: contiene la aplicación anterior con funcionamiento offline. Solo publicar `saas/`.

Pendiente conectar Render y crear el sitio con el acceso autorizado. No hay todavía URL nueva ni un despliegue de Render confirmado.

Después de obtener la URL real, configurar Site URL y las redirecciones permitidas de Supabase Auth para ese origen. Esas opciones no son editables mediante las operaciones de la integración Supabase actual: utilizar el panel web con sesión del propietario. No pedir tokens o contraseñas por chat.

Validar antes de entregar el enlace: acceso anónimo a la página, rechazo de acceso anónimo a datos/RPC, alta y confirmación de cuenta, usuario normal limitado a su negocio, administración con MFA, licencia, comprobantes e instalación desde los teléfonos del propietario y de su esposa. No asegurar que desaparece todo bloqueo de red por cambiar de proveedor: debe comprobarse desde el teléfono afectado.

La cuenta prevista de la esposa es `barbozarosangela70@gmail.com`. No se ha creado mediante una API administrativa ni se le ha enviado correo desde el agente. Verificar su alta y confirmación antes de vincularla al negocio real `kristall-joyas`, según la autorización del propietario.

El negocio real seguía vacío y con licencia pendiente al último chequeo específico de esta cuenta. No habilitar cobros ni registrar pagos ficticios. Al comenzar la prueba autorizada, registrar la versión inicial para retirar únicamente los datos de ensayo cuando el propietario indique que terminaron. No hacer ahora la limpieza solicitada para después.

El bloqueo anterior del dominio chatgpt.site tiene Ray ID `a507cf5a989ca5a2`. El agente no tiene acceso a sus reglas WAF. No reintentar evadirlo con nuevas rutas, proxys o cambios de identidad del navegador.
