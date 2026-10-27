// Boot and real commands must never send telemetry or create tracking ids.
// A non-local hostname catches trackers that deliberately skip localhost.
export const options = { flags: ['--host-resolver-rules=MAP wtd.test 127.0.0.1', '--no-proxy-server'] };
export const expect = { host: 'wtd.test', themeChanged: true, menuUsed: true, slashUsed: true, saved: true, posts: [], visitor: null, session: null };

export default async (t) => {
    const host = new URL(t.base);
    host.hostname = 'wtd.test';
    await t.send('Page.navigate', { url: host.href }); await t.sleep(1200);
    await t.ev('localStorage.clear(); sessionStorage.clear()');
    await t.reload();
    const theme = await t.stored('scheme');
    await t.click('.color-flip');
    const themeChanged = theme !== await t.stored('scheme');
    const mod = await t.ev('/Mac/.test(navigator.platform) ? 4 : 2');
    await t.key('k', 'KeyK', mod); await t.sleep(150);
    const menuUsed = (await t.pickerOpen()) === 'true:commands';
    await t.filter('theme light'); await t.key('Enter');
    await t.focus(); await t.type('/date'); await t.key('Enter');
    const slashUsed = /\d{4}/.test(await t.text());
    await t.type(' private writing'); await t.sleep(500);
    await t.ev("window.dispatchEvent(new Event('pagehide'))"); await t.sleep(200);
    await t.reload();
    return {
        host: await t.ev('location.hostname'), themeChanged, menuUsed, slashUsed,
        saved: (await t.text()).includes('private writing'),
        posts: t.requests.filter(r => r.method === 'POST').map(r => r.url),
        visitor: await t.ev("localStorage.getItem('visitor')"),
        session: await t.ev("sessionStorage.getItem('session')"),
    };
};
