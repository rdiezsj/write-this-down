// node --test test/
// Drift: the page's metadata, JSON-LD and About say what src/facts.mjs says, and the
// generated files in dist/ (when a build exists) are what src/seo.mjs makes of it
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import facts from '../src/facts.mjs';
import { jsonLd, files } from '../src/seo.mjs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const meta = (attribute, name) => (html.match(new RegExp(`<meta ${attribute}="${name}" content="([^"]*)"`)) || [])[1];
const text = (fragment) => fragment.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

test('title, description, canonical, Open Graph and Twitter say the facts', () => {
    assert.equal(html.match(/<title>([^<]*)<\/title>/)[1], facts.title);
    assert.equal(meta('name', 'description'), facts.description);
    assert.match(html, new RegExp(`<link rel="canonical" href="${facts.url}">`));
    assert.equal(meta('property', 'og:title'), facts.title);
    assert.equal(meta('property', 'og:description'), facts.description);
    assert.equal(meta('property', 'og:url'), facts.url);
    assert.equal(meta('property', 'og:site_name'), facts.name);
    assert.equal(meta('name', 'twitter:title'), facts.title);
    assert.equal(meta('name', 'twitter:description'), facts.description);
});

test('the JSON-LD on the page is the one built from the facts', () => {
    const onPage = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)[1]);
    assert.deepEqual(onPage, jsonLd());
    assert.equal(onPage['@type'], 'WebApplication');
    assert.equal(onPage.offers.price, '0');
    assert.equal(onPage.operatingSystem, 'Any');
});

test('About says the same about privacy, the independent project', () => {
    const about = text(html.match(/<div class="description modal"[\s\S]*?<\/div>\s*<div class="help-modal/)[0]);
    // The same privacy promise appears in About and the generated description.
    assert.ok(about.includes('No analytics, cookies or tracking.'), about);
    assert.ok(facts.privacy.includes('No analytics, cookies or tracking.'));
    assert.ok(about.includes(`${facts.name} is an independent project.`));
    assert.ok(html.includes(`href="${facts.publisher.url}"`));
});

test('the manifest agrees', () => {
    const manifest = JSON.parse(readFileSync(new URL('../public/site.webmanifest', import.meta.url), 'utf8'));
    assert.equal(manifest.name, facts.title);
    assert.equal(manifest.short_name, facts.shortName);
});

test('the generated files are current (when a build exists) and well formed', () => {
    const generated = files();
    assert.equal(generated['robots.txt'], `User-agent: *\nAllow: /\n\nSitemap: ${facts.url}sitemap.xml\n`);
    assert.ok(generated['sitemap.xml'].includes(`<loc>${facts.url}</loc>`));
    assert.ok(generated['llms.txt'].startsWith(`# ${facts.name}\n\n> ${facts.description}`));
    assert.ok(generated['llms-full.txt'].includes(facts.privacy));
    assert.ok(!/undefined|\[object/.test(generated['llms.txt'] + generated['llms-full.txt']));

    const dist = new URL('../dist/', import.meta.url);
    if (!existsSync(new URL('index.html', dist))) return;   // no build here; the build writes them

    Object.keys(generated).forEach((name) => {
        assert.ok(existsSync(new URL(name, dist)), `${name} missing from dist`);
        assert.equal(readFileSync(new URL(name, dist), 'utf8'), generated[name], `${name} is stale: rebuild`);
    });
});

test('the service worker does not cache the generated files', () => {
    const gulpfile = readFileSync(new URL('../gulpfile.mjs', import.meta.url), 'utf8');
    const assets = gulpfile.match(/const assets = \[([\s\S]*?)\];/)[1];
    ['robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt'].forEach(name => assert.ok(!assets.includes(name), name));
});


test('la identidad pública y el código no conservan enlaces ni marca del producto original', () => {
    const forbidden = /nanotype|nazdash|zen\.unit\.(?:app|ms)|support@unit\.app|ko-fi\.com|forms\.gle/i;
    const root = new URL('../', import.meta.url);
    const scan = dir => {
        for (const entry of readdirSync(new URL(dir, root), { withFileTypes: true })) {
            const path = `${dir}${entry.name}`;
            if (entry.isDirectory()) scan(`${path}/`);
            else if (/\.(?:js|mjs|scss|html|webmanifest|json|toml)$/.test(path)) {
                assert.ok(!forbidden.test(readFileSync(new URL(path, root), 'utf8')), path);
            }
        }
    };
    for (const dir of ['src/', 'public/', 'fonts/']) scan(dir);
    const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
    assert.equal(pkg.name, 'write-this-down');
    assert.equal(pkg.homepage, facts.url);
    assert.equal(pkg.repository.url, `git+${facts.source}.git`);
});


test('la URL pública y CNAME usan el dominio definitivo',()=>{
    assert.equal(facts.url,'https://writethisdown.eu/');
    assert.equal(JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).homepage,facts.url);
    assert.equal(readFileSync(new URL('../public/CNAME',import.meta.url),'utf8').trim(),new URL(facts.url).hostname);
    const built=new URL('../dist/CNAME',import.meta.url);
    if(existsSync(new URL('../dist/index.html',import.meta.url)))
        assert.equal(readFileSync(built,'utf8').trim(),new URL(facts.url).hostname);
});
