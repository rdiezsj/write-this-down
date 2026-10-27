# Write this down! (WTD)

Editor de texto privado y minimalista. Write This Down es un proyecto independiente; el origen del código, las modificaciones y los avisos de autoría están en [ATTRIBUTION.md](ATTRIBUTION.md).

La interfaz permite elegir español o inglés desde la barra inferior o el menú. La elección se guarda en el navegador y no traduce el contenido de las notas.

Los documentos se guardan en el navegador mediante `localStorage`. No hay cuenta ni servidor de documentos. La aplicación no incluye telemetría. Exportar, crear un enlace compartido o copiar a una carpeta son acciones que decide la persona que escribe. Un enlace compartido contiene el texto en su fragmento (`#`); quien tenga el enlace podrá leerlo, salvo que esté bloqueado con una palabra semilla.


## Funciones

- Varios documentos, nombrados por su primera línea, con duplicado y papelera durante 30 días.
- Importación de archivos `.txt` y `.md`, también al arrastrarlos; exportación a Markdown, texto, impresión o PDF mediante el navegador.
- Enlaces compartidos con el texto dentro del enlace, abiertos o bloqueados con una palabra semilla mediante AES-GCM en el navegador.
- Markdown con vista previa, tablas, tareas, notas al pie, frontmatter y código resaltado; índice de títulos y búsqueda de documentos.
- Menú de comandos, comandos con `/`, atajos de edición, modo de concentración, números de línea y pantalla completa.
- Temas, tres familias tipográficas, tamaños de texto, cursor fino o de bloque y sonidos de teclado opcionales.
- Recuento de palabras y caracteres, y tiempo estimado de lectura, también sobre una selección.
- Funcionamiento sin conexión tras la primera visita compatible e instalación como aplicación.
- Copias de seguridad en JSON o ZIP con archivos Markdown; copia a una carpeta en navegadores de escritorio compatibles con File System Access.

El guardado local no sustituye a una copia de seguridad: borrar los datos del navegador, usar navegación privada o cambiar de origen puede hacer que los documentos dejen de estar disponibles. Exporta los documentos que quieras conservar.

## Desarrollo local

Requiere Node.js 24 y npm. Las pruebas de navegador requieren Google Chrome.

```bash
npm ci
npm run dev              # http://localhost:3002
npm test                 # pruebas unitarias
npm run test:browser     # requiere el servidor local en otra terminal
```

Para generar producción, detén antes el servidor de desarrollo: el build vacía `dist/`.

```bash
npm run build
```

## Estructura

Sitio estático sin framework ni servidor de aplicación. Gulp genera `dist/` desde `src/` y copia los recursos de `public/`.

| Ruta | Contenido |
|---|---|
| `public/index.html` | Editor, comandos, estado y diálogos |
| `public/sw.js`, `public/404.html` | Caché sin conexión y página de error |
| `src/js/main.js` | Inicio de la aplicación |
| `src/js/keys.js` | Claves de almacenamiento del navegador; deben conservarse hasta una migración |
| `src/js/components/` | Almacenamiento, editor, funciones de texto y componentes de interfaz |
| `src/js/components/app.js` | Elementos y estado compartidos por la interfaz |
| `src/js/components/ui.js` | Inicialización, ajustes, menú y atajos |
| `src/facts.mjs`, `src/seo.mjs` | Datos del producto y generación de metadatos |
| `src/scss/` | Estilos organizados por componente |
| `fonts/`, `public/fonts/`, `public/sfx/` | Receta tipográfica, fuentes y sonidos |
| `test/`, `test/browser/` | Pruebas unitarias y de navegador |

WTD utiliza claves `wtd.*`, base IndexedDB `wtd` y copias `wtd-backup`. No migra datos automáticamente desde otros proyectos.

## Documentación de la aplicación

- [ATTRIBUTION.md](ATTRIBUTION.md) y [CREDITS.md](CREDITS.md): origen, autoría y recursos de terceros.

El código se distribuye bajo [AGPL-3.0-only](LICENSE). Se conserva el copyright original de Nazir Dashtiev. Las fuentes, sonidos, lista de palabras y bibliotecas mantienen sus propias licencias; consulta los créditos.

El build distribuye los avisos de las bibliotecas en `dist/js/THIRD_PARTY_LICENSES.txt`, accesibles desde About, junto con los créditos y las licencias de los demás recursos.
