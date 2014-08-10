// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Gtk = imports.gi.Gtk;

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

let DASH_ANIMATION_TIME = Dash.DASH_ANIMATION_TIME;
let DASH_ITEM_LABEL_SHOW_TIME = Dash.DASH_ITEM_LABEL_SHOW_TIME;
let DASH_ITEM_LABEL_HIDE_TIME = Dash.DASH_ITEM_LABEL_HIDE_TIME;
let DASH_ITEM_HOVER_TIMEOUT = Dash.DASH_ITEM_HOVER_TIMEOUT;

let dock_horizontal = true;

const myActiveFolderIcon = new Lang.Class({
    Name: 'myActiveFolderIcon',
    Extends: St.Widget,

    _init: function(iconSize) {
		this.parent();
		this.iconSize = iconSize;
		this.btnFolder = new St.Button({ track_hover: true, can_focus: true});     
		this.btnFolder.connect('clicked', Lang.bind(this, this.pop_up_menu));
		this.btnFolderIcon = new St.Icon({ icon_name: 'go-down-symbolic', icon_size: this.iconSize });
        this.btnFolder.add_actor(this.btnFolderIcon);
        this.btnFolder._delegate = this;
		this.add_child(this.btnFolder);

		let dontCreateMenu = false;//IF no icons? label _("Tray is Empty")

		if (dontCreateMenu)
            this.menu = new PopupMenu.PopupDummyMenu(this.btnFolderIcon);
        else
            this.setMenu(new PopupMenu.PopupMenu(this.btnFolderIcon, 0.5, St.Side.BOTTOM, 0));//Menu-Arrow-Side

		if (!dontCreateMenu)
			this.populate(this.btnFolder);
	},
	
    destroy: function() {
        this.actor._delegate = null;

        if (this.menu)
            this.menu.destroy();
            
        this.actor.destroy();
        this.emit('destroy');
    },

	populate: function(button) {
		let favs = AppFavorites.getAppFavorites().getFavorites();
		for(let i = 0; i < favs.length ;i++) {
			this.add_link(button, favs[i]);
		}		
	},

	add_link: function(button, fav) {
		let item = new PopupMenu.PopupBaseMenuItem;

item.width = this.iconSize;
		
		this.menu.addMenuItem(item);
		let box = new St.BoxLayout({vertical: true});//TODO: verticality	

box.width = this.iconSize;		
		
		item.actor.add_child(box);
		let icon = fav.create_icon_texture(this.iconSize);
		box.add(icon);
		let label = new St.Label({text: fav.get_name()});
		
//this.constrainWidth = new Clutter.BindConstraint({ source: this.icon.actor,
//	coordinate: Clutter.BindCoordinate.WIDTH });
//this.label.actor.add_constraint(this.constrainWidth);		
label.width = this.iconSize;
		box.add(label);
		item.connect("activate", function () {fav.open_new_window(-1);});
	},

	pop_up_menu: function() {
		if (this.menu.isOpen) {
			this.menu.close();
		} else {
log('MAKING dash not autohide');			
			this.menu.open();
		}
	},

    setSensitive: function(sensitive) {
        this.actor.reactive = sensitive;
        this.actor.can_focus = sensitive;
        this.actor.track_hover = sensitive;
    },
        
    setMenu: function(menu) {
        if (this.menu)
            this.menu.destroy();

        this.menu = menu;
        if (this.menu) {
            this.menu.actor.add_style_class_name('panel-menu');//panel-menu|app-well-menu
//            this.menu.connect('open-state-changed', Lang.bind(this, this._onOpenStateChanged));
//            this.menu.actor.connect('key-press-event', Lang.bind(this, this._onMenuKeyPress));

            Main.uiGroup.add_actor(this.menu.actor);
            this.menu.actor.hide();
        }
    },
    
    _onButtonPress: function(actor, event) {
        if (!this.menu)
            return Clutter.EVENT_PROPAGATE;

        this.menu.toggle();
        return Clutter.EVENT_PROPAGATE;
    },

    _onSourceKeyPress: function(actor, event) {
        if (!this.menu)
            return Clutter.EVENT_PROPAGATE;

        let symbol = event.get_key_symbol();
        if (symbol == Clutter.KEY_space || symbol == Clutter.KEY_Return) {
            this.menu.toggle();
            return Clutter.EVENT_STOP;
        } else if (symbol == Clutter.KEY_Escape && this.menu.isOpen) {
            this.menu.close();
            return Clutter.EVENT_STOP;
        } else if (symbol == Clutter.KEY_Down) {
            if (!this.menu.isOpen)
                this.menu.toggle();
            this.menu.actor.navigate_focus(this.actor, Gtk.DirectionType.DOWN, false);
            return Clutter.EVENT_STOP;
        } else
            return Clutter.EVENT_PROPAGATE;
    },

    _onVisibilityChanged: function() {
        if (!this.menu)
            return;

        if (!this.actor.visible)
            this.menu.close();
    },

    _onMenuKeyPress: function(actor, event) {
        if (global.focus_manager.navigate_from_event(event))
            return Clutter.EVENT_STOP;

        let symbol = event.get_key_symbol();
        if (symbol == Clutter.KEY_Left || symbol == Clutter.KEY_Right) {
            let group = global.focus_manager.get_group(this.actor);
            if (group) {
                let direction = (symbol == Clutter.KEY_Left) ? Gtk.DirectionType.LEFT : Gtk.DirectionType.RIGHT;
                group.navigate_focus(this.actor, direction, false);
                return Clutter.EVENT_STOP;
            }
        }
        return Clutter.EVENT_PROPAGATE;
    },

    _onOpenStateChanged: function(menu, open) {
        if (open)
            this.actor.add_style_pseudo_class('active');
        else
            this.actor.remove_style_pseudo_class('active');

        // Setting the max-height won't do any good if the minimum height of the
        // menu is higher then the screen; it's useful if part of the menu is
        // scrollable so the minimum height is smaller than the natural height
        let workArea = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
        this.menu.actor.style = ('max-height: ' + Math.round(workArea.height) + 'px;');
    }	
});

Signals.addSignalMethods(myActiveFolderIcon.prototype);
