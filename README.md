# Write this down! (WTD)

Aplicación: [writethisdown.eu](https://writethisdown.eu/).

Editor de texto privado y minimalista. Write This Down es un proyecto independiente; el origen del código, las modificaciones y los avisos de autoría están en [ATTRIBUTION.md](ATTRIBUTION.md).

La interfaz permite elegir español o inglés desde la barra inferior o el menú. La elección se guarda en el navegador y no traduce el contenido de las notas.

Los documentos se guardan en el almacenamiento del navegador. No hay cuenta ni servidor de documentos. La aplicación no incluye telemetría. Exportar, crear un enlace compartido o copiar a una carpeta son acciones que decide la persona que escribe. Un enlace compartido contiene el texto en su fragmento (`#`); quien tenga el enlace podrá leerlo, salvo que esté bloqueado con una palabra semilla.


Las imágenes de documentos recibidos por enlace requieren pulsar «cargar imagen externa»: su servidor puede conocer tu IP aunque no reciba el referente. El bloqueo se conserva al importar o duplicar la nota y durante la sesión de esa pestaña; al recargar se vuelve a pedir permiso. Las notas propias mantienen la carga habitual de imágenes en la vista previa.

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

Si falla el guardado, WTD mantiene el texto en pantalla y bloquea el cambio o la creación de notas hasta que pueda guardarlo. Puedes exportar la nota actual a Markdown o texto y volver a intentar la operación después de liberar espacio.

La copia a carpeta conserva los archivos preexistentes y las modificaciones externas. Ante un nombre ocupado escribe una copia con otro nombre; solo actualiza o elimina archivos propios cuyo contenido no haya cambiado. Los cambios externos no se importan automáticamente a las notas del navegador. Si borras los datos del navegador o detienes la conexión, WTD pierde su registro de archivos propios y los tratará como preexistentes al conectar de nuevo.

Si el índice de documentos está dañado, WTD conserva el original en el navegador y reconstruye la lista con los datos disponibles. Si no hay espacio para conservar esa evidencia, permite consultar y exportar las notas y mantiene el guardado pausado hasta poder reparar el almacenamiento.

Los enlaces compartidos admiten hasta 1 MiB de documento serializado en UTF-8 y 2 MiB de enlace. Los documentos mayores se pueden exportar como archivos. El límite se aplica también al abrir y descomprimir enlaces recibidos.

## Panel lateral de Opera

La extensión abre el editor desde la barra lateral de Opera. Sus recursos están incluidos en el paquete y puede abrirse sin conexión desde el primer uso.

Para generar el paquete desde el código, con Node.js 24:

```bash
npm ci
npm run build:extension
```

En Opera, abre `opera://extensions`, activa el modo de desarrollador y usa «Cargar extensión descomprimida» para seleccionar la carpeta `dist/opera/`. Si recibes un ZIP, extráelo y selecciona la carpeta que contiene `manifest.json`. Conserva esa carpeta para que Opera pueda seguir cargándola. El icono de WTD abre el panel lateral.

El panel y la web de [Write This Down](https://writethisdown.eu/) comparten notas y papelera dentro del mismo perfil de Opera cuando ambas versiones incluyen el puente local. Cada superficie conserva su nota seleccionada: para abrir una nota recibida, búscala en la lista de documentos. Los ajustes, permisos de carpeta y autorizaciones de imágenes permanecen separados.

El estado indica si el puente está conectado, tiene cambios pendientes o está en pausa. Ante un error, el menú permite reintentar. Si dos ediciones entran en conflicto, WTD conserva las versiones y señala la copia de conflicto en la lista de documentos. Las copias de seguridad incluyen también como notas recuperables las ediciones pendientes que difieran de las notas visibles. La extensión solo se comunica con `https://writethisdown.eu/` y, por compatibilidad, con la ruta anterior `https://rdiezsj.github.io/write-this-down/`.

En Chrome, la aplicación instalada y la pestaña web del mismo origen y perfil comparten el almacenamiento del navegador. Las bibliotecas de Opera y Chrome, o de perfiles distintos, permanecen separadas: usa la exportación y restauración de una copia de seguridad para trasladarlas. Exporta una copia antes de desinstalar la extensión o borrar los datos del navegador.

## Cambio de dominio

La dirección principal es `https://writethisdown.eu/`. Usa HTTPS y actualiza los marcadores. Los enlaces compartidos contienen la nota después de `#`: se puede conservar ese fragmento al sustituir la dirección antigua por la nueva.

Las notas web y los ajustes pertenecen al origen del navegador; el cambio de dominio no los mueve automáticamente. Exporta una copia desde la instalación anterior y restáurala en la nueva. Si la web antigua redirige, conserva las pestañas y PWA que aún tengan tus notas y exporta desde ellas antes de cerrarlas o borrar sus datos. La extensión de Opera conserva su biblioteca al actualizarla en la misma carpeta: recárgala y abre la nueva web en ese perfil; las notas se reciben en la lista de documentos. Para Chrome, importa la copia y vuelve a instalar la PWA desde el dominio nuevo. Conserva la copia hasta comprobar las notas importadas.

## Desarrollo local

`npm run test:browser:build` sirve el build de producción en un puerto temporal y ejecuta las pruebas sin BrowserSync. Añade `-- --subpath` para comprobar `/write-this-down/`. Chrome se detecta automáticamente; puedes indicar otro ejecutable mediante `CHROME`.

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
