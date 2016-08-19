// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Docking = Me.imports.docking;

let settings;
let dockManager;

function init() {
}

function enable() {
    settings = Convenience.getSettings('org.gnome.shell.extensions.dash-to-dock');
    dockManager = new Docking.DockManager(settings);
}

function disable() {
    dockManager.destroy();
    settings.run_dispose();

    dockManager=null;
    settings = null;
}
