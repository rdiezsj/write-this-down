import fs from 'node:fs';
import path from 'node:path';

// Recorre los módulos reales de Webpack, incluidos los concatenados, no todo
// node_modules: las dependencias de herramientas que no llegan a la app se omiten.
export default class ThirdPartyLicensesPlugin {
    apply(compiler) {
        const name = 'ThirdPartyLicenses';
        compiler.hooks.thisCompilation.tap(name, compilation => {
            compilation.hooks.processAssets.tap({
                name,
                stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
            }, () => {
                const packages = new Map();
                const visit = module => {
                    if (module.resource?.includes(`${path.sep}node_modules${path.sep}`)) {
                        let dir = path.dirname(module.resource.split('?')[0]);
                        while (dir !== path.dirname(dir)) {
                            const file = path.join(dir, 'package.json');
                            if (fs.existsSync(file)) {
                                const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
                                if (pkg.name && pkg.version) {
                                    packages.set(`${pkg.name}@${pkg.version}`, { dir, pkg });
                                    break;
                                }
                            }
                            dir = path.dirname(dir);
                        }
                    }
                    for (const child of module.modules || []) visit(child);
                };
                for (const module of compilation.modules) visit(module);
                const blocks = [...packages].sort(([a], [b]) => a.localeCompare(b)).map(([id, { dir, pkg }]) => {
                    const files = fs.readdirSync(dir, { withFileTypes: true })
                        .filter(file => file.isFile() && /^(licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(file.name))
                        .map(file => file.name).sort();
                    if (!files.length) throw new Error(`Faltan avisos de licencia para ${id}`);
                    return `=== ${id} (${pkg.license || 'véase el texto original'}) ===\n\n`
                        + files.map(file => `--- ${file} ---\n\n${fs.readFileSync(path.join(dir, file), 'utf8')}`).join('\n\n');
                });
                const text = 'Licencias y avisos de las bibliotecas incorporadas a la aplicación.\n'
                    + 'Los textos originales se conservan sin traducir ni modificar.\n\n'
                    + blocks.join('\n\n') + '\n';
                compilation.emitAsset('THIRD_PARTY_LICENSES.txt', new compiler.webpack.sources.RawSource(text));
            });
        });
    }
}
