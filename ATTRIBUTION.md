# Atribución y origen

Write This Down es una obra derivada de [NanoType](https://github.com/nazdash/nanotype), de **Nazir Dashtiev**. Este proyecto es independiente y no está afiliado con Nazir Dashtiev, NanoType ni Unit.

## Revisión de origen

- Repositorio original: [nazdash/nanotype](https://github.com/nazdash/nanotype).
- Revisión utilizada como base: [`c2bb046a989fdf2f27c645a3bd8b54682bd310b5`](https://github.com/nazdash/nanotype/tree/c2bb046a989fdf2f27c645a3bd8b54682bd310b5).
- Autor y titular del copyright original: Nazir Dashtiev.
- Licencia del código: **AGPL-3.0-only**, cuyo texto original se conserva en [LICENSE](LICENSE), sin traducir ni modificar.
- Código de esta versión: [rdiezsj/write-this-down](https://github.com/rdiezsj/write-this-down).

Se conserva el copyright de Nazir Dashtiev sobre el código original. Su incorporación a Write This Down no modifica la autoría del código original ni su licencia. Los nombres y marcas del proyecto original no implican afiliación ni autorización de marca.

## Modificaciones de Write This Down

Modificaciones realizadas el **27 a 29 de octubre de 2026** por el proyecto Write This Down:

- Identidad independiente de WTD en interfaz, metadatos, enlaces, almacenamiento y copias; retirada del traslado entre dominios del proyecto original.
- Empaquetado local de la aplicación como extensión para el panel lateral de Opera y conexión del editor con la web mediante un puente dentro del mismo perfil, con cola duradera y copias locales recuperables.
- Reconciliación de bibliotecas y ediciones concurrentes con copias de conflicto, recuperación de escrituras interrumpidas y conservación de datos al reinicializar el puente local.
- Exportación de ediciones pendientes como notas recuperables en las copias de seguridad para su traslado entre perfiles.
- Indicadores traducidos de estado del puente local, aviso de conflictos conservados y reintento desde el menú, respetando los avisos de guardado.
- Interfaz bilingüe español/inglés, título completo y fondo propio de degradados sin caracteres, con movimiento reducido respetado.
- Sustitución de los iconos originales por el diseño propio «Líneas y cursor».
- Sustitución de la fuente monoespaciada original por IBM Plex Mono, con archivos y avisos OFL de IBM sin modificar.
- Política CSP de distribución con hashes de scripts y comprobación de actualización entre versiones.
- Precarga del service worker sin reutilizar la caché HTTP del despliegue anterior, para conservar recursos coherentes al actualizar.
- Zoom móvil sin restricciones y autorización explícita para cargar imágenes recibidas por enlaces compartidos; conservación de esa procedencia en las copias de seguridad.
- Corrección del salto a encabezados en documentos compartidos.
- Coherencia de documentos entre pestañas, recuperación conservadora de índices dañados y límites efectivos en enlaces compartidos; actualización de las herramientas de construcción.
- Protección del texto ante fallos de guardado y de archivos ajenos o modificados externamente en la copia en carpeta; actualización de seguridad de markdown-it a 14.3.3.
- Retirada de la telemetría heredada y de su configuración y documentación.
- Adaptación de las rutas de recursos para servir la aplicación desde una subruta.
- Distribución de los avisos completos de las bibliotecas incorporadas y actualización de la procedencia de la lista de palabras.

## Recursos de terceros

Las fuentes, sonidos, lista de palabras y bibliotecas conservan sus licencias y avisos de copyright. [CREDITS.md](CREDITS.md) identifica cada recurso y enlaza sus fuentes. Los avisos tipográficos completos se mantienen en `public/fonts/LICENSE.txt`.

Conserva esta atribución, `LICENSE` y los avisos de terceros al redistribuir el proyecto. Este documento registra el origen y las modificaciones; las condiciones de licencia están en los textos correspondientes.

- Indicador compacto de conexión local y borde azul del icono lateral de Opera, con etiquetas accesibles y detalle en el menú.

- Dominio principal writethisdown.eu en metadatos, enlaces del panel y configuración de publicación; puente de Opera limitado a ese único origen productivo.
- Cinco paletas con modos independientes, degradados estáticos durante la escritura y bienvenida renovada.
