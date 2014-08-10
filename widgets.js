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
const MyDash = Me.imports.myDash;

let DASH_ANIMATION_TIME = MyDash.DASH_ANIMATION_TIME;
let DASH_ITEM_LABEL_SHOW_TIME = MyDash.DASH_ITEM_LABEL_SHOW_TIME;
let DASH_ITEM_LABEL_HIDE_TIME = MyDash.DASH_ITEM_LABEL_HIDE_TIME;
let DASH_ITEM_HOVER_TIMEOUT = MyDash.DASH_ITEM_HOVER_TIMEOUT;

let dock_horizontal = true;
let tracker = Shell.WindowTracker.get_default();

/**
 * Extends AppIcon:
 * - Pass settings to the constructor and bind settings changes
 * - Apply a css class based on the number of windows of each application (#N);
 *   a class of the form "running#N" is applied to the AppWellIcon actor.
 *   like the original .running one.
 * - add a .focused style to the focused app
 * - Customize click actions.
 *
 */
const myAppIcon = new Lang.Class({
    Name: 'dashToDock.AppIcon',
    Extends: AppDisplay.AppIcon,

	clickAction: {
		SKIP: 0,
		MINIMIZE: 1,
		LAUNCH: 2,
		CYCLE_WINDOWS: 3
	},

    _init: function(settings, app, iconParams, onActivateOverride) {
        this._settings = settings;
        this._maxN = 4;
        this.parent(app, iconParams, onActivateOverride);
        
        this.recentlyClickedAppLoopId = 0;
		this.recentlyClickedApp = null;
		this.recentlyClickedAppWindows = null;
		this.recentlyClickedAppIndex = 0;

        // Monitor windows-changes instead of app state.
        // Keep using the same Id and function callback (that is extended)
        if(this._stateChangedId>0){
            this.app.disconnect(this._stateChangedId);
            this._stateChangedId=0;
        }

        this._stateChangedId = this.app.connect('windows-changed',
			Lang.bind(this,this._onStateChanged));
        this._focuseAppChangeId = tracker.connect('notify::focus-app',
			Lang.bind(this, this._onFocusAppChanged));

    },

    _onDestroy: function() {
        this.parent();

        // Disconect global signals
        // stateChangedId is already handled by parent)
        if(this._focusAppId>0)
            tracker.disconnect(this._focusAppId);
    },

    popupMenu: function() {
        this._removeMenuTimeout();
        this.actor.fake_release();
        this._draggable.fakeRelease();

        if (!this._menu) {
			let side;
			switch(this._settings.get_int('dock-placement')) {
				case 0:
					side = St.Side.LEFT;
				break;	
				case 1:
					side = St.Side.RIGHT;
				break;
				case 2:
					side = St.Side.BOTTOM;
				break;
				case 3:
					side = St.Side.TOP;
				break;	
			}
			this._menu = new myAppIconMenu(this, side);

            this._menu.connect('activate-window',
                Lang.bind(this, function (menu, window) {
                    this.activateWindow(window);
                })
            );

            this._menu.connect('open-state-changed',
                Lang.bind(this, function (menu, isPoppedUp) {
                    if (!isPoppedUp) {
                        this._onMenuPoppedDown();
                    }
                })
            );

			// This causes errors and is not really needed...
			// Usually either a click on the background overview or back on the icon is enough
            //Main.overview.connect('hiding', Lang.bind(this, function () { this._menu.close(); }));

            this._menuManager.addMenu(this._menu);
        }

        this.emit('menu-state-changed', true);
        this.actor.set_hover(true);
        this._menu.popup();
        this._menuManager.ignoreRelease();
        this.emit('sync-tooltip');

        return false;
    },

    _onStateChanged: function() {
        this.parent();
        this._updateCounterClass();
    },

    _onFocusAppChanged: function() {
        if(tracker.focus_app == this.app)
            this.actor.add_style_class_name('focused');
        else
            this.actor.remove_style_class_name('focused');
    },

    _onActivate: function(event) {
        if ( !this._settings.get_boolean('customize-click') ){
            this.parent(event);
            return;
        }

        let modifiers = event.get_state();
        let focusedApp = tracker.focus_app;

        if(this.app.state == Shell.AppState.RUNNING) {

            if(modifiers & Clutter.ModifierType.CONTROL_MASK){
                // Keep default behaviour: launch new window
                this.emit('launching');
                this.app.open_new_window(-1);

            } else if (this._settings.get_boolean('minimize-shift') && modifiers & Clutter.ModifierType.SHIFT_MASK){
                // On double click, minimize all windows in the current workspace
                minimizeWindow(this.app, event.get_click_count() > 1);

            } else if(this.app == focusedApp && !Main.overview._shown){

                if(this._settings.get_enum('click-action') == this.clickAction.CYCLE_WINDOWS){
                    this.emit('launching');
                    this.cycleThroughWindows(this.app);

                } else if(this._settings.get_enum('click-action') == this.clickAction.MINIMIZE)
                    this.minimizeWindow(this.app, true);

                else if(this._settings.get_enum('click-action') == this.clickAction.LAUNCH){
                    this.emit('launching');
                    this.app.open_new_window(-1);
                }

            } else {
                // Activate all window of the app or only le last used
                this.emit('launching');
                if (this._settings.get_enum('click-action') == this.clickAction.CYCLE_WINDOWS && !Main.overview._shown){
                    // If click cycles through windows I can activate one windows at a time
                    let windows = this.getAppInterestingWindows(this.app);
                    let w = windows[0];
                    Main.activateWindow(w);
                } else if(this._settings.get_enum('click-action') == this.clickAction.LAUNCH)
                    this.app.open_new_window(-1);
                else if(this._settings.get_enum('click-action') == this.clickAction.MINIMIZE){
                    // If click minimizes all, then one expects all windows to be reshown
                    this.activateAllWindows(this.app);
                } else
                    this.app.activate();
            }
        } else {
            // Just launch new app
            this.emit('launching');
            this.app.activate();
        }

        Main.overview.hide();
    },

    _updateCounterClass: function() {
        let n = this.getAppInterestingWindows(this.app).length;

        if(n>this._maxN)
             n = this._maxN;

        for(let i = 1; i <= this._maxN; i++){
            let className = 'running'+i;
            if(i!=n)
                this.actor.remove_style_class_name(className);
            else
                this.actor.add_style_class_name(className);
        }
    },

	minimizeWindow: function(app, param){
		// Param true make all app windows minimize
		let windows = this.getAppInterestingWindows(app);
		let current_workspace = global.screen.get_active_workspace();
		for (let i = 0; i < windows.length; i++) {
			let w = windows[i];
			if (w.get_workspace() == current_workspace && w.showing_on_its_workspace()){
				w.minimize();
				// Just minimize one window. By specification it should be the
				// focused window on the current workspace.
				if(!param)
					break;
			}
		}
	},

	/*
	 * By default only non minimized windows are activated.
	 * This activates all windows in the current workspace.
	 */
	activateAllWindows: function(app){
		// First activate first window so workspace is switched if needed.
		app.activate();

		// then activate all other app windows in the current workspace
		let windows = this.getAppInterestingWindows(app);
		let activeWorkspace = global.screen.get_active_workspace_index();

		if( windows.length <= 0)
			return;

		let activatedWindows = 0;

		for (let i = windows.length - 1; i >= 0; i--){
			if(windows[i].get_workspace().index() == activeWorkspace){
				Main.activateWindow(windows[i]);
				activatedWindows++;
			}
		}
	},

	cycleThroughWindows: function(app) {
		// Store for a little amount of time last clicked app and its windows
		// since the order changes upon window interaction
		let MEMORY_TIME = 3000;

		let app_windows = this.getAppInterestingWindows(app);

		if(this.recentlyClickedAppLoopId > 0)
			Mainloop.source_remove(this.recentlyClickedAppLoopId);
		this.recentlyClickedAppLoopId = Mainloop.timeout_add(MEMORY_TIME, this.resetRecentlyClickedApp);

		// If there isn't already a list of windows for the current app,
		// or the stored list is outdated, use the current windows list.
		if( !this.recentlyClickedApp ||
			this.recentlyClickedApp.get_id() != app.get_id() ||
			this.recentlyClickedAppWindows.length != app_windows.length
		  ){

			this.recentlyClickedApp = app;
			this.recentlyClickedAppWindows = app_windows;
			this.recentlyClickedAppIndex = 0;
		}

		this.recentlyClickedAppIndex++;
		let index = this.recentlyClickedAppIndex % this.recentlyClickedAppWindows.length;
		let window = this.recentlyClickedAppWindows[index];

		Main.activateWindow(window);
	},

	resetRecentlyClickedApp: function() {
		if(this.recentlyClickedAppLoopId > 0)
			Mainloop.source_remove(this.recentlyClickedAppLoopId);
		this.recentlyClickedAppLoopId = 0;
		this.recentlyClickedApp = null;
		this.recentlyClickedAppWindows = null;
		this.recentlyClickedAppIndex = 0;

		return false;
	},

	getAppInterestingWindows: function(app) {
		// Filter out unnecessary windows, for instance
		// nautilus desktop window.
		let windows = app.get_windows().filter(function(w) {
			return !w.skip_taskbar;
		});

		return windows;
	} 
});

Signals.addSignalMethods(myAppIcon.prototype);

// This class is a extension of the upstream AppIcon class (ui.appDisplay.js).
const myAppIconMenu = new Lang.Class({
    Name: 'AppIconMenu',
    Extends: AppDisplay.PopupMenu.PopupMenu,

    _init: function(source, side) {
        this.parent(source.actor, 0.5, side);

        // We want to keep the item hovered while the menu is up
        this.blockSourceEvents = true;

        this._source = source;

        this.actor.add_style_class_name('app-well-menu');

        // Chain our visibility and lifecycle to that of the source
        source.actor.connect('notify::mapped', Lang.bind(this, function () {
            if (!source.actor.mapped)
                this.close();
        }));
        source.actor.connect('destroy', Lang.bind(this, function () { this.actor.destroy(); }));

        Main.uiGroup.add_actor(this.actor);
    },

    _redisplay: function() {
        this.removeAll();

        let windows = this._source.app.get_windows().filter(function(w) {
            return !w.skip_taskbar;
        });

        // Display the app windows menu items and the separator between windows
        // of the current desktop and other windows.
        let activeWorkspace = global.screen.get_active_workspace();
        let separatorShown = windows.length > 0 && windows[0].get_workspace() != activeWorkspace;

        for (let i = 0; i < windows.length; i++) {
            let window = windows[i];
            if (!separatorShown && window.get_workspace() != activeWorkspace) {
                this._appendSeparator();
                separatorShown = true;
            }
            let item = this._appendMenuItem(window.title);
            item.connect('activate', Lang.bind(this, function() {
                this.emit('activate-window', window);
            }));
        }

        if (!this._source.app.is_window_backed()) {
            this._appendSeparator();

            this._newWindowMenuItem = this._appendMenuItem(_("New Window"));
            this._newWindowMenuItem.connect('activate', Lang.bind(this, function() {
                this._source.app.open_new_window(-1);
                this.emit('activate-window', null);
            }));
            this._appendSeparator();

            let appInfo = this._source.app.get_app_info();
            let actions = appInfo.list_actions();
            for (let i = 0; i < actions.length; i++) {
                let action = actions[i];
                let item = this._appendMenuItem(appInfo.get_action_name(action));
                item.connect('activate', Lang.bind(this, function(emitter, event) {
                    this._source.app.launch_action(action, event.get_time(), -1);
                    this.emit('activate-window', null);
                }));
            }
            this._appendSeparator();

            let isFavorite = AppFavorites.getAppFavorites().isFavorite(this._source.app.get_id());

            if (isFavorite) {
                let item = this._appendMenuItem(_("Remove from Favorites"));
                item.connect('activate', Lang.bind(this, function() {
                    let favs = AppFavorites.getAppFavorites();
                    favs.removeFavorite(this._source.app.get_id());
                }));
            } else {
                let item = this._appendMenuItem(_("Add to Favorites"));
                item.connect('activate', Lang.bind(this, function() {
                    let favs = AppFavorites.getAppFavorites();
                    favs.addFavorite(this._source.app.get_id());
                }));
            }
        }
    },

    _appendSeparator: function () {
        let separator = new PopupMenu.PopupSeparatorMenuItem();
        this.addMenuItem(separator);
    },

    _appendMenuItem: function(labelText) {
        // FIXME: app-well-menu-item style
        let item = new PopupMenu.PopupMenuItem(labelText);
        this.addMenuItem(item);
        return item;
    },

    popup: function(activatingButton) {
        this._redisplay();
        this.open();
    }
});

Signals.addSignalMethods(myAppIconMenu.prototype);

const myShowAppsIcon = new Lang.Class({
	Name: 'myShowAppsIcon',
                    
    _init: function(iconSize, settings) {
		this._labelText = _("Show Applications");
		this.label = new St.Label({ style_class: 'dash-label'});
		this.label.hide();
		Main.layoutManager.addChrome(this.label);
		this.label_actor = this.label;		
		
		this._settings = settings;
		this.iconSize = iconSize;	
        this.actor = new St.Button({ style_class: 'app-well-app',
                                     reactive: true,
                                     button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
                                     track_hover: true,
                                     can_focus: true,
                                     x_fill: true,
                                     y_fill: true,
                                     toggle_mode: true });
        this.actor._delegate = this;

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
        return new St.Icon({ icon_name: 'view-grid-symbolic',
								icon_size: size,
								style_class: 'show-apps-icon',
								track_hover: true });
    },

    _canRemoveApp: function(app) {
        if (app == null)
            return false;

        let id = app.get_id();
        let isFavorite = AppFavorites.getAppFavorites().isFavorite(id);
        return isFavorite;
    },

    setDragApp: function(app) {
        let canRemove = this._canRemoveApp(app);

        this.actor.set_hover(canRemove);
        if (this._iconActor)
            this._iconActor.set_hover(canRemove);

        if (canRemove) {
			this._labelText = _("Remove from Favorites");
			this.accessible_name = _("Remove from Favorites");
        } else {
            this._labelText = _("Show Applications");
			this.accessible_name = _("Show Applications");
		}
    },

    handleDragOver: function(source, actor, x, y, time) {
        if (!this._canRemoveApp(MyDash.getAppFromSource(source)))
            return DND.DragMotionResult.NO_DROP;

        return DND.DragMotionResult.MOVE_DROP;
    },

    acceptDrop: function(source, actor, x, y, time) {
        let app = MyDash.getAppFromSource(source);
        if (!this._canRemoveApp(app))
            return false;

        let id = app.get_id();

        Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this,
            function () {
                AppFavorites.getAppFavorites().removeFavorite(id);
                return false;
            }));

        return true;
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

/*
const myShowAppsIcon = new Lang.Class({
    Name: 'myShowAppsIcon',
    Extends: MyDash.myDashItemContainer,

    _init: function() {
log('1111111111111111111');		
        this.parent();
log('2222222222222222222');
        this.toggleButton = new St.Button({ style_class: 'show-apps',
                                            track_hover: true,
                                            can_focus: true,
                                            toggle_mode: true });
log('3333333333333333333');                                            
        this._iconActor = null;
log('4444444444444444444');        
        this.icon = new IconGrid.BaseIcon(_("Show Applications"),
                                           { setSizeManually: true,
                                             showLabel: false,
                                             createIcon: Lang.bind(this, this._createIcon) });
log('5555555555555555555');
        this.toggleButton.add_actor(this.icon.actor);
log('6666666666666666666');        
        this.toggleButton._delegate = this;
log('7777777777777777777');
//        this.setChild(this.toggleButton);
log('8888888888888888888');        
        this.setDragApp(null);
log('9999999999999999999');
    },

    _createIcon: function(size) {
        this._iconActor = new St.Icon({ icon_name: 'view-grid-symbolic',
                                        icon_size: size,
                                        style_class: 'show-apps-icon',
                                        track_hover: true });
        return this._iconActor;
    },

    _canRemoveApp: function(app) {
        if (app == null)
            return false;

        let id = app.get_id();
        let isFavorite = AppFavorites.getAppFavorites().isFavorite(id);
        return isFavorite;
    },

    setDragApp: function(app) {
        let canRemove = this._canRemoveApp(app);

        this.toggleButton.set_hover(canRemove);
        if (this._iconActor)
            this._iconActor.set_hover(canRemove);

        if (canRemove)
            this.setLabelText(_("Remove from Favorites"));
        else
            this.setLabelText(_("Show Applications"));
    },

    handleDragOver: function(source, actor, x, y, time) {
        if (!this._canRemoveApp(getAppFromSource(source)))
            return DND.DragMotionResult.NO_DROP;

        return DND.DragMotionResult.MOVE_DROP;
    },

    acceptDrop: function(source, actor, x, y, time) {
        let app = getAppFromSource(source);
        if (!this._canRemoveApp(app))
            return false;

        let id = app.get_id();

        Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this,
            function () {
                AppFavorites.getAppFavorites().removeFavorite(id);
                return false;
            }));

        return true;
    }
});
*/

/* This class is a extension of the upstream ShowAppsIcon class (ui.dash.js).
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
*/
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
		this._dash = dash;

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
			this.loadTray(this.linksStorage.links_data.folders[i].collection_id);	
		}
		
		if (this.linksStorage.links_data.folders.length < 1)
			this.addTray();
	},

    loadTray: function(trayId) {
		this._linkTray = new myLinkTray(this.iconSize, this._settings, this, trayId);
		this._linkTray.childScale = 1;
		this._linkTray.childOpacity = 255;
		this._linkTray.icon.setIconSize(this.iconSize);
		this._dash._hookUpLabelForApplets(this._linkTray);
		this._box.add(this._linkTray.actor);
    },

    addTray: function() {
		let id = Math.random().toString(36).substr(2, 5);
		this.linksStorage.add_tray(id);
		this.loadTray(id);
    },

    removeTray: function(id) {
		if (this.linksStorage.links_data.folders.length > 1) {
			this.linksStorage.remove_tray(id);
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

            this._dragPlaceholder = new myDash.myDragPlaceholderItem();
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

			trayPos++;
        }

		tray.actor.unparent();
		this._box.replace_child(this._dragPlaceholder, tray.actor);
		this.linksStorage.move_tray(tray.id, trayPos);
		this._clearDragPlaceholder();
		
		return true;
    }	
});

Signals.addSignalMethods(myLinkBox.prototype);

const myLinkTray = new Lang.Class({
    Name: 'myLinkTray',

    _init: function(iconSize, settings, myLinkBoxInstance, id) {
		this._labelText = _("Links Tray");	
		this.label = new St.Label({ text: this._labelText, style_class: 'dash-label' });	
		this.label.hide();
		Main.layoutManager.addChrome(this.label);
		this.label_actor = this.label;

		this.settings = settings;
		this.iconSize = iconSize;
		this.myLinkBoxInstance = myLinkBoxInstance;
		this.id = id;

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

		this.menu = new myLinkTrayMenu(this.actor, this.iconSize, this.myLinkBoxInstance.linksStorage, this.id, this.settings);
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
        return new St.Icon({ //gicon: Gio.icon_new_for_string(Me.path + "/media/links-tray.svg"),
								icon_name: 'view-list-symbolic',
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

		let itemRemoveEmptyLinks = new PopupMenu.PopupBaseMenuItem;
		let labelRemoveEmptyLinks = new St.Label({text: _("Remove Empty Links")});
		itemRemoveEmptyLinks.connect("activate", Lang.bind(this, function() { this.callHandler(0) }));
		itemRemoveEmptyLinks.actor.add_child(labelRemoveEmptyLinks);
		this.menu_secondary.addMenuItem(itemRemoveEmptyLinks);

		let itemFreeContents = new PopupMenu.PopupBaseMenuItem;
		let labelFreeContents = new St.Label({text: _("Free Tray Contents")});
		itemFreeContents.connect("activate", Lang.bind(this, function() { this.callHandler(1) }));
		itemFreeContents.actor.add_child(labelFreeContents);
		this.menu_secondary.addMenuItem(itemFreeContents);

		let itemRemoveTray = new PopupMenu.PopupBaseMenuItem;
		let labelRemoveTray = new St.Label({text: _("Remove This Tray")});
		itemRemoveTray.connect("activate", Lang.bind(this, function() { this.callHandler(2) }));
		itemRemoveTray.actor.add_child(labelRemoveTray);
		this.menu_secondary.addMenuItem(itemRemoveTray);
		
		let itemAddTray = new PopupMenu.PopupBaseMenuItem;
		let labelAddTray = new St.Label({text: _("Add Another Tray")});
		itemAddTray.connect("activate", Lang.bind(this, function() { this.callHandler(3) }));
		itemAddTray.actor.add_child(labelAddTray);
		this.menu_secondary.addMenuItem(itemAddTray);		
	},
    
    callHandler: function(conductor) {
		switch (conductor) {
			case 0:
				this.myLinkBoxInstance.linksStorage.remove_empty_links_from_tray(this.id);
				this.menu.close();
				this.menu.populate();
				break;
			case 1:
				new ConfirmFreeContentsDialog(this.menu, this.id, this.myLinkBoxInstance.linksStorage).open();
                break;
            case 2:
				new ConfirmRemoveTrayDialog( this.myLinkBoxInstance, this.id, this ).open();
                break;
            case 3:
				this.myLinkBoxInstance.addTray();
			default:
                break;
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
		item.connect("activate", Lang.bind(this, function() {
			this.addLink(file);
		}));
		item.actor.add_child(label);
		this.menu_secondary.addMenuItem(item, 0);
    },

	/* The file link is added to the tray and LinksDB. */
    addLink: function(file) {
		let item = new myFileIcon(file.get_path(), this.iconSize, this.menu);
		item.lid = Math.random().toString(36).substr(2, 5);
		this.myLinkBoxInstance.linksStorage.add_link_to_tray(this.id, item.lid, file);
		this.menu.populate();
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
	        this._draggable.fakeRelease();
			this.emit('menu-state-changed', true);
			this.actor.set_hover(true);
			this.hideLabel();			
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
			this.hideLabel();			
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

// This class is a extension of the upstream AppIcon class (ui.appDisplay.js).
const myLinkTrayMenu = new Lang.Class({
    Name: 'myLinkTrayMenu',
    Extends: AppDisplay.PopupMenu.PopupMenu,

    _init: function(source, iconSize, linksStorage, trayId, settings) {
        this.parent(source, 0.5, St.Side.TOP);//Menu-Arrow-Side
        this.trayId = trayId;
		this.iconSize = iconSize;
		this.linksStorage = linksStorage;
		this.settings = settings;
		
        // We want to keep the item hovered while the menu is up
        this.blockSourceEvents = true;
        
        // Chain our visibility and lifecycle to that of the source
        source.connect('notify::mapped', Lang.bind(this, function () {
            if (!source.mapped)
                this.close();
        }));    
        source.connect('destroy', Lang.bind(this, function () { this.actor.destroy(); }));
        Main.uiGroup.add_actor(this.actor);
        
        this.icols = 0;
        
        this.populate();
    },
    
	populate: function() {
		for(let i = 0; i < this.linksStorage.links_data.folders.length ;i++) {		
			if (this.trayId == this.linksStorage.links_data.folders[i].collection_id) {		
				this.make_menu(this.linksStorage.links_data.folders[i].links_array);
			}
		}
	},

    make_menu: function(files) {		
		this.box.remove_all_children();
		
		this.icols = 0;
        this.irows = 0;
		
		if (files.length > this.settings.get_int('applet-links-tray-to-grid'))
			this.icols = this.settings.get_int('applet-links-number-of-columns');
		else
			this.icols = 1;
		
		this._table = new St.Table({ x_expand: true,  y_expand: true, homogeneous: true });
		
		let nrow = 0;
		let ncol = 0;
		let i = 0;
		while(i < files.length) {
			let item = new myFileIcon(files[i].link, this.iconSize, this, files[i].id);
			this._table.add(item.actor, { row: nrow, col: ncol, x_fill: false, y_fill: false, 
				x_align: St.Align.MIDDLE, y_align: St.Align.START });

			if (this.icols == 1) {
				nrow++;
			} else {
				if (ncol == (this.icols - 1)) {
					ncol = 0;
					nrow++;
				} else {
					ncol++;
				}
			}
					
			i++;
		}
	
        this._scrollView = new St.ScrollView({ x_fill: true, y_fill: false });
        let vscroll = this._scrollView.get_vscroll_bar();
        vscroll.connect('scroll-start', Lang.bind(this, function() {
            this.passEvents = true;
        }));
        vscroll.connect('scroll-stop', Lang.bind(this, function() {
            this.passEvents = false;
        }));
                
		this.abox = new St.BoxLayout({ vertical: true, x_expand: true});		
		this.abox.add(this._table);
		
		this._scrollView.add_actor(this.abox);
		
		this.box.add(this._scrollView);
		
		// This is the bin icon that allows link deletion
		this.fileIconDeletion = new myFileIconBin(this.iconSize, this);
		this.box.add(this.fileIconDeletion.actor);
		this.fileIconDeletion.actor.hide();
		
		// Calculating the (aesthetic) height for ScrollView. 10 popup menu padding		
		if(this.icols > 1 && nrow > this.icols)
			this._scrollView.height = 300;
    },

    _removeMenuTimeout: function() {
        if (this._menuTimeoutId > 0) {
            Mainloop.source_remove(this._menuTimeoutId);
            this._menuTimeoutId = 0;
        }
    },
});

Signals.addSignalMethods(myLinkTrayMenu.prototype);
/* SOURCE: IconGrid.BaseIcon from iconGrid.js */
const myFileIcon = new Lang.Class({
    Name: 'myFileIcon',

    _init: function (filepath, size, menu, id) {
		let existent = GLib.file_test(filepath, GLib.FileTest.EXISTS);
		this.file = Gio.file_new_for_path(filepath);
		
		this.iconSize = size;
		this.menu = menu;
		this.id = id;

        this.actor = new St.Button({ style_class: 'app-well-app',
                                     reactive: true,
                                     button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
                                     can_focus: true,
                                     x_fill: true,
                                     y_fill: true });
		this.actor._delegate = this;
        this.actor.connect('clicked', Lang.bind(this, function () {
			this.menu.toggle();
			let handler = this.file.query_default_handler (null);
			let result = handler.launch ([this.file], null);
		}));

		let title;
		if(existent)
			title = this.file.get_basename();
		else
			title = filepath;
			
        let styleClass = 'overview-icon';
            styleClass += ' overview-icon-with-label';

        this.box = new St.BoxLayout({ vertical: true, style_class: styleClass });

        this.icon = new St.Icon({ icon_name: 'emblem-important',
									icon_size: this.iconSize,
									style_class: 'show-apps-icon',
									track_hover: true });
									
		this.box.add(this.icon);
	
		this.label = new St.Label({ text: title, x_align: Clutter.ActorAlign.CENTER });

		this.box.add(this.label, { x_align: St.Align.MIDDLE });
		this.actor.set_child(this.box);
		this.box.width = 2.5*this.iconSize;

		if(existent) {
			let info = this.file.query_info('standard::icon,thumbnail::path', 0, null);
					
			if(info.get_file_type() == Gio.FileType.DIRECTORY) {
				this.icon.icon_name = 'folder';
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
				this.icon.set_gicon(gicon);
			}
		}
		
        this._draggable = DND.makeDraggable(this.actor);
        this._draggable.connect('drag-begin', Lang.bind(this,
            function () {
                this.menu._removeMenuTimeout();
				this.menu.fileIconDeletion.actor.show();
            }));
        this._draggable.connect('drag-cancelled', Lang.bind(this,
            function () {
				this.menu.fileIconDeletion.actor.hide();
				this.menu.populate();			
            }));
        this._draggable.connect('drag-end', Lang.bind(this,
            function () {
				this.menu.fileIconDeletion.actor.hide();
            }));           
    },

    acceptDrop : function(source, actor, x, y, time) {
        let link;
		if (source instanceof myFileIcon) {
			link = source;		
		} else {
			link = null;
			return false;
		}

		this.menu.linksStorage.move_link_in_tray(this.menu.trayId, source.id, this.id);
		this.menu.close();
		this.menu.populate();
		this.menu.open();
		
		return true;
    }    
});

const myFileIconBin = new Lang.Class({
    Name: 'myFileIconBin',

    _init: function (size, menu) {
		this.iconSize = size;
		this.menu = menu;

        this.actor = new St.Icon({ icon_name: 'user-trash',
								icon_size: size,
								style_class: 'show-apps-icon',
								track_hover: true,
								margin_top: 10 });
                                     
		this.actor._delegate = this;
    },
   
    acceptDrop : function(source, actor, x, y, time) {
        let link;
		if (source instanceof myFileIcon) {
			link = source;		
		} else {
			link = null;
			return false;
		}

		this.menu.linksStorage.remove_link_from_tray(this.menu.trayId, source.id);
		this.actor.hide();
		this.menu.close();
		this.menu.populate();
		this.menu.open();
		
		return false;
    }
});

//this.box.set_style('background-color: yellow;');//Debugging
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
        this.icon_actor_access = this.icon_actor_access = new St.Icon({ icon_name: 'user-trash',
												icon_size: this.iconSize,
												style_class: 'show-apps-icon',
												track_hover: true });
        this.icon = new IconGrid.BaseIcon(this._labelText, { setSizeManually: true, 
			showLabel: false, createIcon: Lang.bind(this, this._createIcon) });
		
		this.actor.set_child(this.icon.actor);

		this.trash_path = 'trash:///';
		this.trash_file = Gio.file_new_for_uri(this.trash_path);
    
		this.menuManager = new PopupMenu.PopupMenuManager(this);
		
		this.menu = new PopupMenu.PopupMenu(this.actor, 0.5, St.Side.BOTTOM, 0);
		this.blockSourceEvents = true;
		this.menu.actor.add_style_class_name('app-well-menu');
		Main.uiGroup.add_actor(this.menu.actor);         
		this.menu.actor.hide();
        
		this.menuManager.addMenu(this.menu);
		this.populate();
	
        this.setupWatch();			
        this.binChange();
	},

    destroy: function() {
        this.actor._delegate = null;

        if (this.menu)
            this.menu.destroy();
            
        this.actor.destroy();
        this.emit('destroy');
    },
    
    _createIcon: function(size) {
        return this.icon_actor_access;
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
		this.binMonitor = this.trash_file.monitor_directory(0, null, null);
        this.binMonitor.connect('changed', Lang.bind(this, this.binChange));
    },

    binChange: function() {
		this.trash_path = 'trash:///';
        this.trash_file = Gio.file_new_for_uri(this.trash_path);		
		let binItems = this.trash_file.enumerate_children('*', 0, null, null);	
		let count = 0;
		let file_info = null;
		while ((file_info = binItems.next_file(null, null)) != null) {
			count++;
		}	
		if (count > 0) {
			this.icon_actor_access.set_icon_name('user-trash-full');
		} else {
			this.icon_actor_access.set_icon_name('user-trash');
		}
    },

    openBin: function() {
		Gio.app_info_launch_default_for_uri(this.trash_path, null);
    },

	deleteBin: function() {
		new ConfirmClearBinDialog(Lang.bind(this, this.doDeleteBin)).open();
    },

	doDeleteBin: function() {		
		let app = Gio.app_info_create_from_commandline("gvfs-trash --empty", 
			null, Gio.AppInfoCreateFlags.NONE).launch([],null);		
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

	_init: function(menu, id, linksStorage) {
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
				linksStorage.free_tray_contents(id);
				menu.removeAll();
				menu.populate();
			})
		}
		]);
	}
});

const ConfirmRemoveTrayDialog = new Lang.Class({
	Name: 'ConfirmRemoveTrayDialog',
    Extends: ModalDialog.ModalDialog,

	_init: function(myLinkBoxInstance, id, myTray) {
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
				myLinkBoxInstance.removeTray(id);
				myTray.destroy();
			})
		}
		]);
	}
});
