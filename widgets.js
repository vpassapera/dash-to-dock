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

/* This class is a extension of the upstream ShowAppsIcon class (ui.dash.js). */
const myShowAppsIcon = new Lang.Class({
    Name: 'myShowAppsIcon',
    Extends: Dash.ShowAppsIcon,

    _init: function() {
        this.parent();
    },

	showLabel: function() {
		if (!this._labelText) {
			return;
		}

		this.label.set_text(this._labelText);
		this.label.opacity = 0;
		this.label.show();

		//let [stageX, stageY] = this.actor.get_transformed_position();
		let [stageX, stageY] = this.get_transformed_position();

		let labelHeight = this.label.get_height();
		let labelWidth = this.label.get_width();

		let node = this.label.get_theme_node();
		let yOffset = node.get_length('-x-offset');
		let y = stageY - labelHeight - yOffset;
		
		//let itemWidth = this.actor.allocation.x2 - this.actor.allocation.x1;
		let itemWidth = this.allocation.x2 - this.allocation.x1;
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

const myLinkTray = new Lang.Class({
    Name: 'myLinkTray',
                        
    _init: function(iconSize, settings, linksStorage, ii) {
		this._labelText = _("Links Tray");
		this.label = new St.Label({ style_class: 'dash-label'});
		this.label.hide();
		Main.layoutManager.addChrome(this.label);
		this.label_actor = this.label;

		this._settings = settings;
		this.iconSize = iconSize;
		this.linksStorage = linksStorage;
//TODO: make it unique
//FIXME: IF THERE ARE NO TRAYS?
		this.id = this.linksStorage.links_data.folders[ii].collection_order;

        this.actor = new St.Button({ style_class: 'app-well-app',
                                     reactive: true,
                                     button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
                                     can_focus: true,
                                     x_fill: true,
                                     y_fill: true });
        this.actor._delegate = this;		
        this.actor.connect('button_release_event', Lang.bind(this, this.buttonPressed));
        this.icon = new IconGrid.BaseIcon(this._labelText, { setSizeManually: true, 
			showLabel: false, createIcon: Lang.bind(this, this._createIcon) });
			
		this.actor.set_child(this.icon.actor);
				
		this.menuManager = new PopupMenu.PopupMenuManager(this);		

		this.menu = new myLinkTrayMenu(this.actor, iconSize, this.linksStorage, this.id);
		this.menu.actor.hide();
		this.menu_secondary = new PopupMenu.PopupMenu(this.icon.actor, 0.5, St.Side.BOTTOM, 0);
		this.menu_secondary.blockSourceEvents = true;		
		this.populate_menu_secondary();
		this.menu_secondary.actor.add_style_class_name('app-well-menu');
		Main.uiGroup.add_actor(this.menu_secondary.actor);
		this.menu_secondary.actor.hide();	  
        
		this.menuManager.addMenu(this.menu);
		this.menuManager.addMenu(this.menu_secondary);		

        this._draggable = DND.makeDraggable(this.actor);
        this._draggable.connect('drag-begin', Lang.bind(this,
            function () {
                this._removeMenuTimeout();
                Main.overview.beginItemDrag(this);
            }));
        this._draggable.connect('drag-cancelled', Lang.bind(this,
            function () {
                Main.overview.cancelledItemDrag(this);
            }));
        this._draggable.connect('drag-end', Lang.bind(this,
            function () {
               Main.overview.endItemDrag(this);
            }));
	},

    destroy: function() {
        this.actor._delegate = null;

        if (this.menu)
            this.menu.destroy();
            
        if (this.menu_secondary)
            this.menu_secondary.destroy();            
            
        this.actor.destroy();
        this.emit('destroy');
    },

    _createIcon: function(size) {
        return new St.Icon({ gicon: Gio.icon_new_for_string(Me.path + "/media/links-tray.svg"),
								icon_size: size,
								style_class: 'show-apps-icon',
								track_hover: true });
    },  

	populate_menu_secondary: function() {
		this.menu_secondary.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		
		let itemScanLinks = new PopupMenu.PopupBaseMenuItem;
		let labelScanLinks = new St.Label({text: _("Scan Clipboard for Links")});
		itemScanLinks.connect("activate", Lang.bind(this,  this.scanLinks));
		itemScanLinks.actor.add_child(labelScanLinks);
		this.menu_secondary.addMenuItem(itemScanLinks);
		
        this.menu_secondary.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

		let itemFreeContents = new PopupMenu.PopupBaseMenuItem;
		let labelFreeContents = new St.Label({text: _("Free Tray Contents")});
		itemFreeContents.connect("activate", Lang.bind(this, function() { this.callHandler(0) }));
		itemFreeContents.actor.add_child(labelFreeContents);
		this.menu_secondary.addMenuItem(itemFreeContents);

		let itemRemoveTray = new PopupMenu.PopupBaseMenuItem;
		let labelRemoveTray = new St.Label({text: _("Remove This Tray")});
		itemRemoveTray.connect("activate", Lang.bind(this, function() { this.callHandler(1) }));
		itemRemoveTray.actor.add_child(labelRemoveTray);
		this.menu_secondary.addMenuItem(itemRemoveTray);
		
		let itemAddTray = new PopupMenu.PopupBaseMenuItem;
		let labelAddTray = new St.Label({text: _("Add Another Tray")});
		itemAddTray.connect("activate", Lang.bind(this, this.addTray));
		itemAddTray.actor.add_child(labelAddTray);
		this.menu_secondary.addMenuItem(itemAddTray);		
	},
    
    callHandler: function(conductor) {
		if (conductor == 0) {
			new ConfirmFreeContentsDialog(Lang.bind(this, this.freeContents)).open();
		} else if (conductor == 1) {
			new ConfirmRemoveTrayDialog(Lang.bind(this, this.removeTray)).open();
		}
    },     

	/* 
	 * Removes the old suggestions and then repopulate menu.
	 * IMPORTANT: @keep_items is there to represent the items
	 * from populate_menu_secondary(). Keep Updated!
	 */
    scanLinks: function() {
		let keep_items = 6;
		if(this.menu_secondary.length > keep_items) {
			let items = this.menu_secondary._getMenuItems();
			for (let i = 0; i < (items.length - keep_items); i++) {			
				if (items[i] instanceof PopupMenu.PopupBaseMenuItem) {
						items[i].destroy();
				}
			}
		}

		let clipboard = St.Clipboard.get_default();
		clipboard.get_text(St.ClipboardType.CLIPBOARD, Lang.bind(this,
			function(clipboard, text) {
				if (!text) return;
				
				this.parseClipboardLinks(text);
		}));
    },    

    parseClipboardLinks: function(text) {
		
		let array = text.split("\n");
		
		for (let i = 0 ; i < array.length; i++) {
			if (array[i] != null || array[i] != undefined) {
				array[i].trim();
				
				let file = Gio.file_new_for_path(array[i]);
				if (GLib.file_test(array[i], GLib.FileTest.EXISTS)) {
					//Now we add the files as a suggested entries
					this.addSuggestedLink(file);
				}
			}
		}
    },

	/* 
	 * This item here will be placed in the secondary menu,
	 * to give an option to the user to add it permanently
	 * to the Links Tray and LinksDB instances.
	 */
    addSuggestedLink: function(file) {
		let item = new PopupMenu.PopupBaseMenuItem;
		let label = new St.Label({text: file.get_basename() });
		item.connect("activate", Lang.bind(this, function(){
			this.addLink(file);
		}));
		item.actor.add_child(label);
		this.menu_secondary.addMenuItem(item, 0);	
    },

	/* The file link is added to the tray and LinksDB. */
    addLink: function(file) {
		let item = new myPopupImageMenuItem(file, this.iconSize);	
		this.menu.addMenuItem(item, 0);
		item.connect('activate', Lang.bind(this, function () {
			let handler = file.query_default_handler (null);
			let result = handler.launch ([file], null);
		}));
				
		//TODO: add to LinkDB
    },

    freeContents: function() {

    },
    
    removeTray: function() {

    },
    
    addTray: function() {

    },        
    
    _removeMenuTimeout: function() {
        if (this._menuTimeoutId > 0) {
            Mainloop.source_remove(this._menuTimeoutId);
            this._menuTimeoutId = 0;
        }
    },
    
	buttonPressed: function(actor, event) {
		if (event.get_button() == 1) {
			this.popupMenu(true);
		} else {
			this.popupMenu(false);
		}
	},
    
    popupMenu: function(primary) {
		if (primary) {
			this._removeMenuTimeout();
			this.actor.fake_release();
	        //this._draggable.fakeRelease();
			this.emit('menu-state-changed', true);
			this.actor.set_hover(true);
			this.menu_secondary.close();			
			this.menu.toggle();		
			this.menuManager.ignoreRelease();
			this.emit('sync-tooltip');
		} else {
			this._removeMenuTimeout();
			this.actor.fake_release();
	        this._draggable.fakeRelease();
			this.emit('menu-state-changed', true);
			this.actor.set_hover(true);
			this.menu.close();	
			this.menu_secondary.toggle();
			this.menuManager.ignoreRelease();
			this.emit('sync-tooltip');		
		}
		
        return false;
    },

	showLabel: function() {
		if (!this._labelText) {
			return;
		}

		this.label.set_text(this._labelText);
		this.label.opacity = 0;
		this.label.show();

		let [stageX, stageY] = this.actor.get_transformed_position();

		let labelHeight = this.label.get_height();
		let labelWidth = this.label.get_width();

		let node = this.label.get_theme_node();
		let yOffset = node.get_length('-x-offset');
		let y = stageY - labelHeight - yOffset;
		
		let itemWidth = this.actor.allocation.x2 - this.actor.allocation.x1;
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

Signals.addSignalMethods(myLinkTray.prototype);

const myLinkBox = new Lang.Class({
    Name: 'myLinkBox',
    Extends: St.BoxLayout,
    
	_init: function(iconSize, settings, dash) {
		if (!dock_horizontal) {
			this.parent({ vertical: true, clip_to_allocation: true });
		} else {
			this.parent({ vertical: false, clip_to_allocation: true });
		}

		this._settings = settings;
		this.iconSize = iconSize;

        this._dragPlaceholder = null;
        this._dragPlaceholderPos = -1;
        this._animatingPlaceholdersCount = 0;

        this._box;
        if (!dock_horizontal) {
			this._box = new St.BoxLayout({ vertical: true, clip_to_allocation: false });
		} else {
			this._box = new St.BoxLayout({ vertical: false, clip_to_allocation: false });
		}
		this._box._delegate = this;

		this._scrollView = new St.ScrollView({ reactive: true });
        if (!dock_horizontal) {
			this._scrollView.hscrollbar_policy = Gtk.PolicyType.NEVER;
			this._scrollView.vscroll.hide();
		} else {
			this._scrollView.vscrollbar_policy = Gtk.PolicyType.NEVER;
			this._scrollView.hscroll.hide();
		}

		this._scrollView.add_actor(this._box);
		this._scrollView.connect('scroll-event', Lang.bind(this, this._onScrollEvent ));
		this.add_actor(this._scrollView);
		
		this.linksStorage = new Convenience.LinksDB();
		
		for(let i = 0; i < this.linksStorage.links_data.folders.length ;i++) {
			this._linkTray = new myLinkTray(iconSize, settings, this.linksStorage, i);
			this._linkTray.childScale = 1;
			this._linkTray.childOpacity = 255;
			this._linkTray.icon.setIconSize(iconSize);
			dash._hookUpLabelForApplets(this._linkTray);
			this._box.add(this._linkTray.actor);
		}		
	},
	
	_onScrollEvent: function(actor, event) {
		switch(event.get_scroll_direction()) {
			case Clutter.ScrollDirection.UP:
				this._onScrollBtnLeftOrTop(actor);				
				break;
			case Clutter.ScrollDirection.DOWN:
				this._onScrollBtnRightOrBottom(actor);
				break;
			case Clutter.ScrollDirection.SMOOTH:			
				let [dx, dy] = event.get_scroll_delta();
				if (dy < 0) {
					this._onScrollBtnLeftOrTop(actor);
				} else if(dy > 0) {
					this._onScrollBtnRightOrBottom(actor);
				}
				break;
			default:
				break;
		}
					
		return true;
    },      
        
    _onScrollBtnLeftOrTop: function(scroll_actor) {
		if (!dock_horizontal) {
			let vscroll = scroll_actor.get_vscroll_bar();
			vscroll.get_adjustment().set_value(vscroll.get_adjustment().get_value() - scroll_actor.height);				
		} else {
			let hscroll = scroll_actor.get_hscroll_bar();
			hscroll.get_adjustment().set_value(hscroll.get_adjustment().get_value() - scroll_actor.width);	
		}
    },
    
    _onScrollBtnRightOrBottom: function(scroll_actor) {
		if (!dock_horizontal) {
			let vscroll = scroll_actor.get_vscroll_bar();
			vscroll.get_adjustment().set_value(vscroll.get_adjustment().get_value() + scroll_actor.height);				
		} else {
			let hscroll = scroll_actor.get_hscroll_bar();
			hscroll.get_adjustment().set_value(hscroll.get_adjustment().get_value() + scroll_actor.width);			
		}
    },

    _clearDragPlaceholder: function() {
        if (this._dragPlaceholder) {
            this._animatingPlaceholdersCount++;
            this._dragPlaceholder.animateOutAndDestroy();
            this._dragPlaceholder.connect('destroy',
                Lang.bind(this, function() {
                    this._animatingPlaceholdersCount--;
                }));
            this._dragPlaceholder = null;
        }
        this._dragPlaceholderPos = -1;
    },

    handleDragOver : function(source, actor, x, y, time) {
        let tray;
		if (source instanceof myLinkTray) {
			tray = source;
		} else {
			tray = null;
		}

        // Don't allow favoriting of transient apps
        if (tray == null)
            return DND.DragMotionResult.NO_DROP;

        let trays = this._box.get_children();
        let numTrays = trays.length;

        let trayPos = trays.indexOf(tray);

        let children = this._box.get_children();
        let numChildren = children.length;

		let pos, boxHeight, boxWidth
		if (!dock_horizontal) {
			boxHeight = 0;
			for (let i = 0; i < numChildren; i++) {
				boxHeight += children[i].height;
			}

			// Keep the placeholder out of the index calculation; assuming that
			// the remove target has the same size as "normal" items, we don't
			// need to do the same adjustment there.
			if (this._dragPlaceholder) {
				boxHeight -= this._dragPlaceholder.height;
				numChildren--;
			}

			if (!this._emptyDropTarget) {
				pos = Math.floor(y * numChildren / boxHeight);
				if (pos >  numChildren)
					pos = numChildren;
			} else
				pos = 0; // always insert at the top when dash is empty
		} else {
			boxWidth = this._box.width;
			if (this._dragPlaceholder) {
				boxWidth -= this._dragPlaceholder.width;
				numChildren--;
			}

			if (!this._emptyDropTarget) {
				pos = Math.floor(x * numChildren / boxWidth);
			}
		}

        if (pos != this._dragPlaceholderPos && pos <= numTrays && this._animatingPlaceholdersCount == 0) {
            this._dragPlaceholderPos = pos;

            // Don't allow positioning before or after self
            if (trayPos != -1 && (pos == trayPos || pos == trayPos + 1)) {
                this._clearDragPlaceholder();
                return DND.DragMotionResult.CONTINUE;
            }

            // If the placeholder already exists, we just move
            // it, but if we are adding it, expand its size in
            // an animation
            let fadeIn;
            if (this._dragPlaceholder) {
                this._dragPlaceholder.destroy();
                fadeIn = false;
            } else {
                fadeIn = true;
            }

            this._dragPlaceholder = new Dash.DragPlaceholderItem();
			if (!dock_horizontal) {
				this._dragPlaceholder.child.set_width (this.iconSize);
				this._dragPlaceholder.child.set_height (this.iconSize / 2);

			} else {
				this._dragPlaceholder.child.set_width (this.iconSize / 2);
				this._dragPlaceholder.child.set_height (this.iconSize);
			}
            this._box.insert_child_at_index(this._dragPlaceholder,
                                            this._dragPlaceholderPos);
            this._dragPlaceholder.show(fadeIn);
        }

        // Remove the drag placeholder if we are not in the
        // "tray zone"        
        if (pos > numTrays)
            this._clearDragPlaceholder();

        if (!this._dragPlaceholder)
            return DND.DragMotionResult.NO_DROP;

        if (trayPos != -1)
            return DND.DragMotionResult.MOVE_DROP;

        return DND.DragMotionResult.COPY_DROP;
    },

    // Draggable target interface
    acceptDrop : function(source, actor, x, y, time) {
        // No drag placeholder means we don't wan't to add tray
        // and we are dragging it to its original position
        if (!this._dragPlaceholder)
            return false;		
		
        let tray;
		if (source instanceof myLinkTray) {
			tray = source;
		} else {
			tray = null;
			return false;
		}

		let trays = this._box.get_children();

        let trayPos = 0;

        let children = this._box.get_children();
        
        for (let i = 0; i < this._dragPlaceholderPos; i++) {
            if (this._dragPlaceholder && children[i] == this._dragPlaceholder)
                continue;

            if (tray.id == children[i].id)
                continue;

			trayPos++;
        }

		tray.actor.unparent();
		this._box.replace_child(this._dragPlaceholder, tray.actor);

        this._clearDragPlaceholder();
	
		return true;
    }	
});

Signals.addSignalMethods(myLinkBox.prototype);

// This class is a extension of the upstream AppIcon class (ui.appDisplay.js).
const myLinkTrayMenu = new Lang.Class({
    Name: 'myLinkTrayMenu',
    Extends: AppDisplay.PopupMenu.PopupMenu,

    _init: function(source, iconSize, linksStorage, trayId) {
        this.parent(source, 0.5, St.Side.TOP);//Menu-Arrow-Side
        this.trayId = trayId;
		this.iconSize = iconSize;
		this.linksStorage = linksStorage;
		
        // We want to keep the item hovered while the menu is up
        this.blockSourceEvents = true;

        this.actor.add_style_class_name('app-well-menu-custom');

this.actor.add_style_class_name('popup-menu-ornament2');
this.actor.add_style_class_name('popup-menu-content2');
        
        // Chain our visibility and lifecycle to that of the source
        source.connect('notify::mapped', Lang.bind(this, function () {
            if (!source.mapped)
                this.close();
        }));    
        source.connect('destroy', Lang.bind(this, function () { this.actor.destroy(); }));
        Main.uiGroup.add_actor(this.actor);
        
        this.populate();
    },
    
	populate: function() {
		for(let i = 0; i < this.linksStorage.links_data.folders.length ;i++) {
			if (this.trayId == this.linksStorage.links_data.folders[i].collection_order) {
				if (this.linksStorage.links_data.folders[i].links_array.length > 0) {
					for(let j = 0; j < this.linksStorage.links_data.folders[i].links_array.length ;j++) {
						this._appendMenuItem(this.linksStorage.
							links_data.folders[i].links_array[j].link.trim());
					}
				}
			}
		}
	},
	
	/*
    _redisplay: function() {
        this.removeAll();
        this.populate();  
    },*/
    
    _appendMenuItem: function(fileuri) {		
		let file = Gio.file_new_for_path(fileuri);
		let item = new myPopupImageMenuItem(file, this.iconSize);
		item.connect('activate', Lang.bind(this, function () {
			let handler = file.query_default_handler (null);
			let result = handler.launch ([file], null);
		}));
		this.addMenuItem(item, 0);//order?
		return item;
    }          
});

Signals.addSignalMethods(myLinkTrayMenu.prototype);

const myPopupImageMenuItem = new Lang.Class({
    Name: 'myPopupImageMenuItem',
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function (file, size) {
        this.parent();

		this.actor.set_vertical(true);

        this._icon = new St.Icon();
		this.actor.add(this._icon, { x_align: St.Align.MIDDLE });

        let info = file.query_info('standard::icon,thumbnail::path', 0, null);
        
		if(info.get_file_type() == Gio.FileType.DIRECTORY) {
			this.setIcon('folder');
		} else {
			let gicon = null;
			let thumbnail_path = info.get_attribute_as_string('thumbnail::path', 0, null);
			if (thumbnail_path) {
				gicon = Gio.icon_new_for_string(thumbnail_path);
			} else {
				let icon_internal = info.get_icon()
				let icon_path = null;
				if (icon_internal instanceof Gio.ThemedIcon) {
					icon_path = icon_internal.get_names()[0];
				} else if (icon_internal instanceof Gio.FileIcon) {
					icon_path = icon.get_file().get_path();
				}
				gicon = Gio.icon_new_for_string(icon_path);
			}
			this._icon.set_gicon(gicon);
		}
		
		this.label = new St.Label({ text: file.get_basename() });
        this.actor.add(this.label, { icon_size: size, x_align: St.Align.MIDDLE });		
    },

    setIcon: function(name) {
        this._icon.icon_name = name;
    }
});

const myShowDesktop = new Lang.Class({
	Name: 'myShowDesktop',
                    
    _init: function(iconSize, settings) {
		
		this._labelText = _("Show Desktop");
		this.label = new St.Label({ style_class: 'dash-label'});
		this.label.hide();
		Main.layoutManager.addChrome(this.label);
		this.label_actor = this.label;		
		
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
        
        this.icon = new IconGrid.BaseIcon(this._labelText, { setSizeManually: true, 
			showLabel: false, createIcon: Lang.bind(this, this._createIcon) });
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
    },
    
	showLabel: function() {
		if (!this._labelText) {
			return;
		}

		this.label.set_text(this._labelText);
		this.label.opacity = 0;
		this.label.show();

		let [stageX, stageY] = this.actor.get_transformed_position();

		let labelHeight = this.label.get_height();
		let labelWidth = this.label.get_width();

		let node = this.label.get_theme_node();
		let yOffset = node.get_length('-x-offset');
		let y = stageY - labelHeight - yOffset;
		
		let itemWidth = this.actor.allocation.x2 - this.actor.allocation.x1;
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

Signals.addSignalMethods(myShowDesktop.prototype);

/* Functions: openBin(), setupWatch(), deleteBin(), doDeleteBin()
 * have been taken from SOURCE: gnome-shell-trash extension
 */
const myRecyclingBin = new Lang.Class({
    Name: 'myRecyclingBin',
                    
    _init: function(iconSize, settings) {				
		this._labelText = _("Recycling Bin");
		this.label = new St.Label({ style_class: 'dash-label'});
		this.label.hide();
		Main.layoutManager.addChrome(this.label);
		this.label_actor = this.label;

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
        this.icon = new IconGrid.BaseIcon(this._labelText, { setSizeManually: true, 
			showLabel: false, createIcon: Lang.bind(this, this._createIcon) });
			
		this.actor.set_child(this.icon.actor);

        //this.recycling_bin_path = 'trash:///';//FIXME: BUG in Ubuntu cannot access trash:/// gvfs fuse
        this.recycling_bin_path = '~/.local/share/Trash/files';
        this.recycling_bin_file = Gio.file_new_for_uri(this.recycling_bin_path);
    
		this.menuManager = new PopupMenu.PopupMenuManager(this);
		
		//this.menu = new PopupMenu.PopupMenu(this.icon.actor, 0.5, St.Side.BOTTOM, 0);
		//this.menu = new PopupMenu.PopupMenu(this.actor, 0.5, St.Side.BOTTOM, 0);//good without st.widget
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
    
    _createIcon: function(size) {
        return new St.Icon({ icon_name: 'user-trash',
                                        icon_size: size,
                                        style_class: 'show-apps-icon',
                                        track_hover: true });
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

        return false;
    },
    
	showLabel: function() {
		if (!this._labelText) {
			return;
		}

		this.label.set_text(this._labelText);
		this.label.opacity = 0;
		this.label.show();

		let [stageX, stageY] = this.actor.get_transformed_position();

		let labelHeight = this.label.get_height();
		let labelWidth = this.label.get_width();

		let node = this.label.get_theme_node();
		let yOffset = node.get_length('-x-offset');
		let y = stageY - labelHeight - yOffset;
		
		let itemWidth = this.actor.allocation.x2 - this.actor.allocation.x1;
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

	_init: function(givenMethod) {
		this.parent({ styleClass: null });
		
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
			givenMethod();
			})
		}
		]);
	}
});

const ConfirmFreeContentsDialog = new Lang.Class({
	Name: 'ConfirmFreeContentsDialog',
    Extends: ModalDialog.ModalDialog,

	_init: function(givenMethod) {
		this.parent({ styleClass: null });
		
		let mainContentBox = new St.BoxLayout({ style_class: 'polkit-dialog-main-layout',
			vertical: false });
		this.contentLayout.add(mainContentBox, { x_fill: true, y_fill: true });

		let messageBox = new St.BoxLayout({ style_class: 'polkit-dialog-message-layout',
			vertical: true });
		mainContentBox.add(messageBox, { y_align: St.Align.START });

		this._subjectLabel = new St.Label({ style_class: 'polkit-dialog-headline',
			text: _("Free Contents from Links Tray") });

		messageBox.add(this._subjectLabel, { y_fill:  false, y_align: St.Align.START });

		this._descriptionLabel = new St.Label({ style_class: 'polkit-dialog-description',
			text: _("Are you sure you want to remove all of the items in this Links Tray?") });

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
			label: _("Clear"),
			action: Lang.bind(this, function() {
			this.close();
			givenMethod();
			})
		}
		]);
	}
});

const ConfirmRemoveTrayDialog = new Lang.Class({
	Name: 'ConfirmRemoveTrayDialog',
    Extends: ModalDialog.ModalDialog,

	_init: function(givenMethod) {
		this.parent({ styleClass: null });
		
		let mainContentBox = new St.BoxLayout({ style_class: 'polkit-dialog-main-layout',
			vertical: false });
		this.contentLayout.add(mainContentBox, { x_fill: true, y_fill: true });

		let messageBox = new St.BoxLayout({ style_class: 'polkit-dialog-message-layout',
			vertical: true });
		mainContentBox.add(messageBox, { y_align: St.Align.START });

		this._subjectLabel = new St.Label({ style_class: 'polkit-dialog-headline',
			text: _("Remove Links Tray") });

		messageBox.add(this._subjectLabel, { y_fill:  false, y_align: St.Align.START });

		this._descriptionLabel = new St.Label({ style_class: 'polkit-dialog-description',
			text: _("Are you sure you want to remove this Links Tray instace and all of the items?") });

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
			label: _("Remove"),
			action: Lang.bind(this, function() {
			this.close();
			givenMethod();
			})
		}
		]);
	}
});
