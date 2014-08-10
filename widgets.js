// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const ModalDialog = imports.ui.modalDialog;

const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Signals = imports.signals;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Mainloop = imports.mainloop;

const PopupMenu = imports.ui.appDisplay.PopupMenu;
const AppDisplay = imports.ui.appDisplay;
const AppFavorites = imports.ui.appFavorites;
const Dash = imports.ui.dash;
const DND = imports.ui.dnd;

const IconGrid = imports.ui.iconGrid;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Workspace = imports.ui.workspace;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const ExtensionUtils = imports.misc.extensionUtils;

let dock_horizontal = true;

const myLinkTray = new Lang.Class({
    Name: 'myLinkTray',
                    
    _init: function(iconSize, settings) {
		this._settings = settings;
		this.iconSize = iconSize;	
        this.actor = new St.Button({ style_class: 'app-well-app',
                                     reactive: true,
                                     button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
                                     can_focus: true,
                                     x_fill: true,
                                     y_fill: true });
        this.actor._delegate = this;		
		
		this.actor.connect('clicked', Lang.bind(this, this.popupMenu));
		this.icon_actor = null;
        this.icon = new IconGrid.BaseIcon(_("Show Applications"),
                                           { setSizeManually: true, showLabel: false,
                                             createIcon: Lang.bind(this, this._createIcon) });
		this.actor.set_child(this.icon.actor);

		let dontCreateMenu = false;//IF no icons? label _("Tray is Empty")

		this.menuManager = new PopupMenu.PopupMenuManager(this);

		if (dontCreateMenu) {
            this.menu = new PopupMenu.PopupDummyMenu(this.btnFolderIcon);
        } else {
			this.menu = new myLinkTrayMenu(this, iconSize);
           
            this.menu.actor.hide();    
        }
        
		this.menuManager.addMenu(this.menu);

//------------------------------------------------------------------
let clipboard = St.Clipboard.get_default();
clipboard.get_text(St.ClipboardType.CLIPBOARD, Lang.bind(this,
	function(clipboard, text) {
		if (!text)
			return;
			
log(">>>>>>>>>>>> "+text);                  

}));

//St.Clipboard.get_default().get_text(St.ClipboardType.PRIMARY);
//clipboard.get_text();
//log('BOARD TEXT IS: '+ St.Clipboard.get_default().get_text(St.ClipboardType.PRIMARY) );

		//let path = '/home/pc/.local/share/gnome-shell/extensions/dash-to-dock@micxgx.gmail.com/new.js1';
/*
        let path = Gio.file_new_for_path(ExtensionUtils.getCurrentExtension().path);
path +='/new';
log("My Path is1: "+path);
log("My Path is2: "+ExtensionUtils.getCurrentExtension().path); 


//let userExtensionsPath = GLib.build_filenamev([global.userdatadir, 'extensions']);
//log("My Path is3: "+userExtensionsPath.path ); 
//userExtensionsDir = Gio.file_new_for_path(userExtensionsPath);
try {
path.make_directory_with_parents(null);
} catch (e) {
global.logError('' + e);
}*/

     
		
		/*if ( GLib.file_test(path, GLib.FileTest.EXISTS) ) {
			log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
			//return Gio.File.new_for_path(paths[i]);
		} else {
			log("WRITES? ");
			Gio.File.new_for_path(path);
		}*/

//		var input_file = Gio.file_new_for_path(path);
//		var fstream = input_file.read();
//		var dstream = new Gio.DataInputStream.c_new(fstream);
//		var line = dstream.read_until(“”, 0);
//		fstream.close();
//		log(line);

/*
		let rowFilePath = GLib.get_home_dir() + '.local/share/gnome-shell/extensions/dash-to-dock@micxgx.gmail.com/1';
		log(rowFilePath);

		if ( GLib.file_test(path, GLib.FileTest.EXISTS) ) {
			log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
		} else {
			log("WRITES? ");
			Gio.File.new_for_path(path);
		}
*/
//------------------------------------------------------------------
//		if (!dontCreateMenu)
//			this.menu.populate();
//------------------------------------------------------------------

//let exo = new DIAL();

	},

    destroy: function() {
        this.actor._delegate = null;

        if (this.menu)
            this.menu.destroy();
            
        this.actor.destroy();
        this.emit('destroy');
    },

    _createIcon: function(size) {
        this.icon_actor = new St.Icon({ icon_name: 'go-down-symbolic',
                                        icon_size: size,
                                        style_class: 'show-apps-icon',
                                        track_hover: true });
        return this.icon_actor;
    },
    
    _removeMenuTimeout: function() {
        if (this._menuTimeoutId > 0) {
            Mainloop.source_remove(this._menuTimeoutId);
            this._menuTimeoutId = 0;
        }
    },
    
    popupMenu: function() {
        this._removeMenuTimeout();
        this.actor.fake_release();
//        this._draggable.fakeRelease();
        this.emit('menu-state-changed', true);
        this.actor.set_hover(true);
        this.menu.toggle();
        this.menuManager.ignoreRelease();
        this.emit('sync-tooltip');

        return false;
    },

    handleDragOver: function(source, actor, x, y, time) {
		if (source == Main.xdndHandler) {
			//log('LAUNCHING DIALOG');
		}
        return DND.DragMotionResult.MOVE_DROP;
    },

    acceptDrop: function(source, actor, x, y, time) {
log("ACCEPTER_A_DROP");
/*
        let id = app.get_id();

        Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this,
            function () {
                AppFavorites.getAppFavorites().removeFavorite(id);
                return false;
            }));
*/
        return true;
    }    
});

Signals.addSignalMethods(myLinkTray.prototype);

// This class is a extension of the upstream AppIcon class (ui.appDisplay.js).
const myLinkTrayMenu = new Lang.Class({
    Name: 'myLinkTrayMenu',
    Extends: AppDisplay.PopupMenu.PopupMenu,

    _init: function(source, iconSize) {
		this.iconSize = iconSize;
        this.parent(source.actor, 0.5, St.Side.TOP);//Menu-Arrow-Side

        // We want to keep the item hovered while the menu is up
        this.blockSourceEvents = true;

        this._source = source;

        this.actor.add_style_class_name('app-well-menu-custom');

this.actor.add_style_class_name('popup-menu-ornament2');
this.actor.add_style_class_name('popup-menu-content2');
        
        // Chain our visibility and lifecycle to that of the source
        source.actor.connect('notify::mapped', Lang.bind(this, function () {
            if (!source.actor.mapped)
                this.close();
        }));    
        source.actor.connect('destroy', Lang.bind(this, function () { this.actor.destroy(); }));
        Main.uiGroup.add_actor(this.actor);
        
        this.populate();
    },
    
	populate: function() {
//------------------------------------
		let item = new PopupMenu.PopupBaseMenuItem;
		let box = new St.BoxLayout({ vertical: false });
		// This entry can make an icon, if it is crtl+v an icon or folder on/in it
		let entryAddLink = new St.Entry({ x_align: St.Align.START });
		entryAddLink.set_width(20);		
		box.add(entryAddLink);
//		let btnAddLink = new St.Button({ label: "+", reactive: true, can_focus: true});	
//		btnAddLink.connect('clicked', Lang.bind(this, function () { 
//			log("ADDING LINK "+this.entryAddLink.get_text());
//		}));

//		box.add(btnAddLink);
		item.actor.add_child(box);
		item.connect("activate", function () { log("ADDING LINK "+entryAddLink.get_text()); });		
		this.addMenuItem(item);
//------------------------------------	
		let favs = AppFavorites.getAppFavorites().getFavorites();
		for(let i = 0; i < favs.length ;i++) {
			this._appendMenuItem( favs[i] ); 
		}
	},
	
	/*
    _redisplay: function() {
        this.removeAll();
        this.populate();  
    },*/
    
    _appendMenuItem: function(fav) {
		
//		let icon = fav.create_icon_texture(this.iconSize);
		//box.add(icon, {x_align: Clutter.ActorAlign.CENTER});
		
        // FIXME: app-well-menu-item style
//        let item = new PopupMenu.PopupMenuItem( fav.get_name() );
//        this.addMenuItem(item);
//        return item;


		let item = new PopupMenu.PopupBaseMenuItem;
//item.width = parseInt(this.iconSize, 10);
		let box = new St.BoxLayout({vertical: true, x_align: Clutter.ActorAlign.CENTER});//TODO: verticality	
//box.width = parseInt(this.iconSize, 10);
		
		item.actor.add_child(box);
		let icon = fav.create_icon_texture(parseInt(this.iconSize, 10));
		box.add(icon, {x_align: Clutter.ActorAlign.CENTER});
		let label = new St.Label({text: fav.get_name(), x_align: Clutter.ActorAlign.CENTER});
		
		box.add(label);
		item.connect("activate", function () {fav.open_new_window(-1);});
		
		this.addMenuItem(item);
		return item;
    }          
});

Signals.addSignalMethods(myLinkTrayMenu.prototype);
