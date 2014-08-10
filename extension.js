// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Intellihide = Me.imports.intellihide;
const DockedDash = Me.imports.dockedDash;
const Lang = imports.lang;

let settings;
let intellihide;
let dock;

function init() {}

function show(){
    dock.disableAutoHide();
}

function hide(){
    dock.enableAutoHide();
}

function resetDockOrientation() {
    intellihide.destroy();
    dock.destroy();
    dock=null;
    intellihide=null;
    settings = Convenience.getSettings('org.gnome.shell.extensions.dash-to-dock');
    settings.connect('changed::dock-placement', Lang.bind(this, this.resetDockOrientation));
    dock = new DockedDash.dockedDash(settings);
    intellihide = new Intellihide.Intellihide(show, hide, dock, settings);
}

function enable() {
    settings = Convenience.getSettings('org.gnome.shell.extensions.dash-to-dock');
    settings.connect('changed::dock-placement', Lang.bind(this, this.resetDockOrientation));
    dock = new DockedDash.dockedDash(settings);
    intellihide = new Intellihide.Intellihide(show, hide, dock, settings);
}

function disable() {
    intellihide.destroy();
    dock.destroy();
    settings.run_dispose();

    dock=null;
    intellihide=null;
    settings = null;
}

