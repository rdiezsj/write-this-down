# Créditos

El código original conserva su copyright y su licencia AGPL-3.0-only. [ATTRIBUTION.md](ATTRIBUTION.md) identifica su autoría, repositorio y revisión de origen, y las modificaciones de este proyecto.

Los recursos de terceros mantienen las siguientes licencias y atribuciones.

## Fuentes (`public/fonts`, SIL Open Font License 1.1)

- **WTD Mono**: derivada de Nanotype Mono (antes Zen Mono), versión de [Iosevka](https://github.com/be5invis/Iosevka), de Belleve Invis, compilada con `fonts/wtd-mono.build-plans.toml`, que añade cirílico y símbolos de teclado. El aviso de la fuente incluye también a Ahmed Hatem. WTD cambia los nombres de familia y archivos; conserva los glifos y los avisos OFL.
- **Inter**: [Inter Project Authors](https://github.com/rsms/inter).
- **Literata**: [Literata Project Authors](https://github.com/googlefonts/literata).

Los avisos de copyright y el texto de la licencia están en `public/fonts/LICENSE.txt` y se conservan sin traducir.

## Sonidos (`public/sfx`)

Los sonidos de **máquina de escribir** son recortes de *Old typewriter.wav*, de [juskiddink](https://freesound.org/people/juskiddink/sounds/75105/) en Freesound, bajo [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Los demás sonidos se sintetizan en el navegador mediante `src/js/components/sounds.js`.

## Palabras (`public/words.txt`)

Las palabras semilla para bloquear enlaces compartidos proceden de la [EFF large wordlist](https://www.eff.org/deeplinks/2016/07/new-wordlists-random-passphrases), de Electronic Frontier Foundation, bajo [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), conforme a la [política del titular](https://www.eff.org/copyright). La copia se ha reconstruido desde el recurso actual de EFF: omite los códigos de dados y cuatro palabras con guion, conservando las 7772 restantes. La atribución y las modificaciones están en `public/words.LICENSE.txt`, distribuido como `words.LICENSE.txt`.

## Bibliotecas incorporadas al build

| Biblioteca npm | Licencia |
|---|---|
| `markdown-it` | MIT |
| `markdown-it-footnote` | MIT |
| `markdown-it-task-lists` | ISC |
| `highlight.js` | BSD-3-Clause |
| `fflate` | MIT |

El build genera `dist/js/THIRD_PARTY_LICENSES.txt` con el nombre, la versión y los textos íntegros de licencia y avisos de cada biblioteca incorporada al JavaScript. Incluye también las dependencias transitivas: `entities` (BSD-2-Clause), `linkify-it`, `uc.micro`, `mdurl` y `punycode.js` (MIT). Puede abrirse desde el diálogo About.

El archivo se obtiene de los módulos reales de Webpack, no de todo `node_modules`. Si falta un aviso de licencia de un paquete incorporado, la compilación falla. Las herramientas de desarrollo que no llegan a la aplicación no se incluyen en ese archivo.
