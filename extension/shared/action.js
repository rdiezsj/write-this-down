const api=globalThis.browser || globalThis.chrome;
const manifest=api.runtime.getManifest();
if(manifest.side_panel) {
    api.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(console.error);
} else if(api.sidebarAction?.open && !manifest.action.default_popup) {
    api.action.onClicked.addListener(()=>api.sidebarAction.open().catch(console.error));
}
