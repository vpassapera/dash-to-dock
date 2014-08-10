// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;

const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Signals = imports.signals;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Mainloop = imports.mainloop;

const ModalDialog = imports.ui.modalDialog;
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

let DASH_ANIMATION_TIME = Dash.DASH_ANIMATION_TIME;
let DASH_ITEM_LABEL_SHOW_TIME = Dash.DASH_ITEM_LABEL_SHOW_TIME;
let DASH_ITEM_LABEL_HIDE_TIME = Dash.DASH_ITEM_LABEL_HIDE_TIME;
let DASH_ITEM_HOVER_TIMEOUT = Dash.DASH_ITEM_HOVER_TIMEOUT;

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
            this.menu = new PopupMenu.PopupDummyMenu(this);
        } else {
			this.menu = new myLinkTrayMenu(this, iconSize);
           
            this.menu.actor.hide();
        }
        
		this.menuManager.addMenu(this.menu);

//------------------------------------------------------------------

let exo = new Convenience.LinksDB();


/*let clipboard = St.Clipboard.get_default();
clipboard.get_text(St.ClipboardType.CLIPBOARD, Lang.bind(this,
	function(clipboard, text) {
		if (!text)
			return;
			
log(">>>>>>>>>>>> "+text);                  

}));
*/

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
        /*
        this.icon_actor = new St.Icon({ icon_name: 'go-down-symbolic',
                                        icon_size: size,
                                        style_class: 'show-apps-icon',
                                        track_hover: true });
		*/
		let LT = Gio.icon_new_for_string(Me.path + "/media/links-tray.svg");
        this.icon_actor = new St.Icon({ gicon: LT,
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


//----------------------------------------------------------------------------------


const myShowDesktop = new Lang.Class({
    Name: 'myShowDesktop',
                    
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

        this.actor.connect("clicked", Lang.bind(this, this.show_hide_desktop));
        
        this.tracker = Shell.WindowTracker.get_default();
        this.desktopShown = false;
        this.alreadyMinimizedWindows = [];
        
        this.icon = new IconGrid.BaseIcon(_("Show Desktop"),
                                           { setSizeManually: true, showLabel: false,
                                             createIcon: Lang.bind(this, this._createIcon) });
		this.actor.set_child(this.icon.actor);
	},

    destroy: function() {
        this.actor._delegate = null;

        if (this.menu)
            this.menu.destroy();
            
        this.actor.destroy();
        this.emit('destroy');
    },

    _createIcon: function(size) {
        return new St.Icon({ icon_name: 'user-desktop',
                                        icon_size: size,
                                        style_class: 'show-apps-icon',
                                        track_hover: true });
    },
    
	/* SOURCE: show desktop extension */
    show_hide_desktop: function() {
        Main.overview.hide();
        let metaWorkspace = global.screen.get_active_workspace();
        let windows = metaWorkspace.list_windows();
        
        if (this.desktopShown) {
            for ( let i = 0; i < windows.length; ++i ) {  
				if (windows[i].get_window_type() == 0 || windows[i].get_window_type() == 3) {               
                    let shouldrestore = true;
                    for (let j = 0; j < this.alreadyMinimizedWindows.length; j++) {
                        if (windows[i] == this.alreadyMinimizedWindows[j]) {
                            shouldrestore = false;
                            break;
                        }                        
                    }    
                    if (shouldrestore) {
                        windows[i].unminimize();                                  
                    }
                }
            }
            this.alreadyMinimizedWindows.length = [];
        } else {
            for ( let i = 0; i < windows.length; ++i ) {
				if (windows[i].get_window_type() == 0 || windows[i].get_window_type() == 3) {
                    if (!windows[i].minimized) {
                        windows[i].minimize();
                    }
                    else {
                        this.alreadyMinimizedWindows.push(windows[i]);
                    }                    
                }
            }
        }
        this.desktopShown = !this.desktopShown;
    }
});

Signals.addSignalMethods(myShowDesktop.prototype);

/* Functions: openBin(), setupWatch(), deleteBin(), doDeleteBin()
 * have been taken from SOURCE: gnome-shell-trash extension
 */
const myRecyclingBin = new Lang.Class({
    Name: 'myRecyclingBin',
    Extends: St.Widget,
                    
    _init: function(iconSize, settings) {
		this.parent({ style_class: 'dash-item-container' });
				
		this._labelText = _("Recycling Bin");
		this.label = new St.Label({ style_class: 'dash-label'});
		this.label.hide();
		Main.layoutManager.addChrome(this.label);
		this.label_actor = this.label;
		
		this._settings = settings;
		this.iconSize = iconSize;
			
        this.actor = new St.Button({ style_class: 'show-apps',
                                     reactive: true,
                                     button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
                                     can_focus: true,
                                     x_fill: true,
                                     y_fill: true });
        this.actor._delegate = this;		
		this.actor.connect('clicked', Lang.bind(this, this.popupMenu));
		this.icon = new St.Icon({ icon_name: 'user-trash',
                                        icon_size: this.iconSize,
                                        style_class: 'show-apps-icon',
                                        track_hover: true });
		this.actor.set_child(this.icon);

        //this.recycling_bin_path = 'trash:///';//FIXME: BUG in Ubuntu cannot access trash:/// gvfs fuse
        this.recycling_bin_path = '~/.local/share/Trash/files';
        this.recycling_bin_file = Gio.file_new_for_uri(this.recycling_bin_path);
    
		this.menuManager = new PopupMenu.PopupMenuManager(this);
		
		//this.menu = new PopupMenu.PopupMenu(this.icon.actor, 0.5, St.Side.BOTTOM, 0);
		this.menu = new PopupMenu.PopupMenu(this.actor, 0.5, St.Side.BOTTOM, 0);
		this.blockSourceEvents = true;
		this.menu.actor.add_style_class_name('app-well-menu');
		Main.uiGroup.add_actor(this.menu.actor);         
		this.menu.actor.hide();
        
		this.menuManager.addMenu(this.menu);
		this.populate();
		
        //this.setupWatch();			
        //this.binChange();       
	},

    destroy: function() {
        this.actor._delegate = null;

        if (this.menu)
            this.menu.destroy();
            
        this.actor.destroy();
        this.emit('destroy');
    },
    
    _removeMenuTimeout: function() {
        if (this._menuTimeoutId > 0) {
            Mainloop.source_remove(this._menuTimeoutId);
            this._menuTimeoutId = 0;
        }
    },

	populate: function(button) {
		let itemDelete = new PopupMenu.PopupBaseMenuItem;
		let labelDelete = new St.Label({text: _("Delete Binned Files")});
		itemDelete.connect("activate", Lang.bind(this, this.deleteBin));
		itemDelete.actor.add_child(labelDelete);
		this.menu.addMenuItem(itemDelete);
		
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

		let itemOpen = new PopupMenu.PopupBaseMenuItem;
		let labelOpen = new St.Label({text: _("Open in Nautilus")});
		itemOpen.connect("activate", Lang.bind(this, this.openBin));
		itemOpen.actor.add_child(labelOpen);
		this.menu.addMenuItem(itemOpen);
	},
 
    setupWatch: function() {
		log(1);
        this.binMonitor = this.recycling_bin_file.monitor_directory(0, null, null);
        this.binMonitor.connect('changed', Lang.bind(this, this.binChange));
    },

    binChange: function() {
		log(2);
		let binItems = this.recycling_bin_file.enumerate_children('*', 0, null, null);
		let count = 0;
		let file_info = null;
		while ((file_info = binItems.next_file(null, null)) != null) {
			count++;
		}
		if (count > 0) {
			this.icon.set_icon_name('user-trash-full');
		} else {
			this.icon.set_icon_name('user-trash');
		}	
    },

    openBin: function() {
		/* 
		 * Gio.IOErrorEnum: Operation not supported
		 * this.recycling_bin_path = 'trash:///';
         * this.recycling_bin_file = Gio.file_new_for_uri(this.recycling_bin_path);
         * Gio.app_info_launch_default_for_uri(this.recycling_bin_file.get_uri(), null);
         * 
         * FIXED by either:
         * 1. let app = Gio.app_info_create_from_commandline
         * 		("nautilus trash:///", null, Gio.AppInfoCreateFlags.NONE)
         * 		.launch([],null);//[] : files to launch, list element expected
         * 
         * 2. sudo apt-get install --reinstall nautilus
         */
		Gio.app_info_launch_default_for_uri(this.recycling_bin_file.get_uri(), null);         
    },

	deleteBin: function() {
		new ConfirmClearBinDialog(Lang.bind(this, this.doDeleteBin)).open();
    },

	doDeleteBin: function() {		
		let children = this.recycling_bin_file.enumerate_children('*', 0, null, null);
		let child_info = null;
		while ((child_info = children.next_file(null, null)) != null) {
			let child = this.recycling_bin_file.get_child(child_info.get_name());
			child.delete(null);
		}
    },

    popupMenu: function() {
        this._removeMenuTimeout();
        this.actor.fake_release();
        this.emit('menu-state-changed', true);
        this.actor.set_hover(true);
        this.menu.toggle();
        this.menuManager.ignoreRelease();
        this.emit('sync-tooltip');

        return false;
    },
    
	/*
	 * Changes were made to make the label show on the top.
	 * SOURCE: simple-dock extension.
	 */
	showLabel: function() {
		if (!this._labelText) {
			return;
		}

		this.label.set_text(this._labelText);
		this.label.opacity = 0;
		this.label.show();

//		let [stageX, stageY] = this.actor.get_transformed_position();//works
//		let [stageX, stageY] = this.icon.get_transformed_position();//works
		let [stageX, stageY] = this.actor.get_transformed_position();

		let labelHeight = this.label.get_height();
		let labelWidth = this.label.get_width();

		let node = this.label.get_theme_node();
		let yOffset = node.get_length('-x-offset');

//		let y = stageY - labelHeight - yOffset;
		let y = stageY - labelHeight - yOffset;
log('yNEW '+Math.round(stageY)+' '+labelHeight+' '+yOffset);
		//let itemWidth = this.allocation.x2 - this.allocation.x1;
		let itemWidth = this.icon.allocation.x2 - this.icon.allocation.x1;
		let xOffset = Math.floor((itemWidth - labelWidth) / 2);

		let x = stageX + xOffset;

		this.label.set_position(x, y);

		Tweener.addTween(this.label, {
			opacity: 255,
			time: DASH_ITEM_LABEL_SHOW_TIME,
			transition: 'easeOutQuad',
		});
	},

    hideLabel: function () {
        Tweener.addTween(this.label,
                         { opacity: 0,
                           time: DASH_ITEM_LABEL_HIDE_TIME,
                           transition: 'easeOutQuad',
                           onComplete: Lang.bind(this, function() {
                               this.label.hide();
                           })
                         });
    }     
});

Signals.addSignalMethods(myRecyclingBin.prototype);

const ConfirmClearBinDialog = new Lang.Class({
	Name: 'ConfirmClearBinDialog',
    Extends: ModalDialog.ModalDialog,

	_init: function(deleteMethod) {
		ModalDialog.ModalDialog.prototype._init.call(this, { styleClass: null });

		let mainContentBox = new St.BoxLayout({ style_class: 'polkit-dialog-main-layout',
			vertical: false });
		this.contentLayout.add(mainContentBox, { x_fill: true, y_fill: true });

		let messageBox = new St.BoxLayout({ style_class: 'polkit-dialog-message-layout',
			vertical: true });
		mainContentBox.add(messageBox, { y_align: St.Align.START });

		this._subjectLabel = new St.Label({ style_class: 'polkit-dialog-headline',
			text: _("Clear Recycling Bin?") });

		messageBox.add(this._subjectLabel, { y_fill:  false, y_align: St.Align.START });

		this._descriptionLabel = new St.Label({ style_class: 'polkit-dialog-description',
			text: _("Are you sure you want to delete all of the items in the recycling bin?") });

		messageBox.add(this._descriptionLabel, { y_fill:  true, y_align: St.Align.START });

		this.setButtons(
		[
		{
			label: _("Cancel"),
			action: Lang.bind(this, function() {
			this.close();
			}),
			key: Clutter.Escape
		},
		{
			label: _("Delete"),
			action: Lang.bind(this, function() {
			this.close();
			deleteMethod();
			})
		}
		]);
	}
});
