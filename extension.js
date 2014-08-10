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

function rebootDock() {
	disable();
	enable();
}

function enable() {	
    settings = Convenience.getSettings('org.gnome.shell.extensions.dash-to-dock');
    settings.connect('changed::dock-placement', Lang.bind(this, this.rebootDock));
    settings.connect('changed::applets-order', Lang.bind(this, this.rebootDock));
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
