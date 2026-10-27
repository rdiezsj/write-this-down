import test from 'node:test';
import assert from 'node:assert/strict';
import { t, setLanguage, preferredLanguage } from '../src/js/components/i18n.js';

test('el idioma elegido traduce la interfaz y permite volver al inglés', () => {
    setLanguage('es');
    assert.equal(t('new document'), 'nuevo documento');
    assert.equal(t('theme dark'), 'tema oscuro');
    assert.equal(t('0 words'), '0 palabras');
    assert.equal(t('1 word · 6 chars'), '1 palabra · 6 caracteres');
    setLanguage('en');
    assert.equal(t('new document'), 'new document');
    assert.equal(t('theme dark'), 'theme dark');
});

test('nombres de documentos, archivos y carpetas capturados permanecen intactos', () => {
    setLanguage('es');
    assert.equal(t('exported menu new theme.md'), 'exportado menu new theme.md');
    assert.equal(t('restored "new document"'), '«new document» recuperado');
    assert.equal(t('copying to "theme dark" as you write'), 'copiando a «theme dark» mientras escribes');
    assert.equal(t('a note with  two spaces'), 'a note with  two spaces');
    assert.equal(t('/date'), '/date');
    setLanguage('en');
});

test('la detección respeta el primer idioma compatible preferido por el navegador', () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'languages');
    try {
        for (const [languages, expected] of [
            [['es-ES', 'en'], 'es'], [['en-US', 'es'], 'en'], [['fr', 'es'], 'es'], [['fr'], 'en'],
        ]) {
            Object.defineProperty(navigator, 'languages', { configurable: true, value: languages });
            assert.equal(preferredLanguage(), expected);
        }
    } finally {
        if (original) Object.defineProperty(navigator, 'languages', original);
        else delete navigator.languages;
    }
});

test('las acciones y los avisos pendientes se traducen completos', () => {
    setLanguage('es');
    assert.equal(t('share as a link…'), 'compartir mediante enlace…');
    assert.equal(t('pasted 2,000 words'), 'pegadas 2,000 palabras');
    assert.equal(t('failed'), 'no se pudo copiar');
    assert.equal(t('enter open · Ctrl D duplicate · Ctrl ⌫ delete'), 'intro abrir · Ctrl D duplicar · Ctrl ⌫ eliminar');
    assert.equal(t('enter restore · Ctrl ⌫ delete for good'), 'intro recuperar · Ctrl ⌫ eliminar definitivamente');
    setLanguage('en');
});

test('los espacios y separadores dentro de los nombres se conservan en los avisos', () => {
    setLanguage('es');
    assert.equal(t('restored "My  note"'), '«My  note» recuperado');
    assert.equal(t('exported My  note · draft.md'), 'exportado My  note · draft.md');
    setLanguage('en');
});
