// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Signals = imports.signals;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Mainloop = imports.mainloop;

const AppDisplay = imports.ui.appDisplay;
const AppFavorites = imports.ui.appFavorites;
const Dash = imports.ui.dash;
const DND = imports.ui.dnd;
const IconGrid = imports.ui.iconGrid;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const Tweener = imports.ui.tweener;
const Util = imports.misc.util;
const Workspace = imports.ui.workspace;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const WindowPreview = Me.imports.windowPreview;

let tracker = Shell.WindowTracker.get_default();

let DASH_ITEM_LABEL_SHOW_TIME = Dash.DASH_ITEM_LABEL_SHOW_TIME;

const clickAction = {
    SKIP: 0,
    MINIMIZE: 1,
    LAUNCH: 2,
    CYCLE_WINDOWS: 3,
    QUIT: 4
};

let recentlyClickedAppLoopId = 0;
let recentlyClickedApp = null;
let recentlyClickedAppWindows = null;
let recentlyClickedAppIndex = 0;

/**
 * Extend AppIcon
 *
 * - Pass settings to the constructor and bind settings changes
 * - Apply a css class based on the number of windows of each application (#N);
 * - Draw a dot for each window of the application based on the default "dot" style which is hidden (#N);
 *   a class of the form "running#N" is applied to the AppWellIcon actor.
 *   like the original .running one.
 * - Add a .focused style to the focused app
 * - Customize click actions.
 * - Update minimization animation target
 */
const MyAppIcon = new Lang.Class({
    Name: 'DashToDock.AppIcon',
    Extends: AppDisplay.AppIcon,

    // settings are required inside.
    _init: function(settings, app, iconParams, onActivateOverride) {
        // a prefix is required to avoid conflicting with the parent class variable
        this._dtdSettings = settings;
        this._nWindows = 0;

        this.parent(app, iconParams, onActivateOverride);

        // Monitor windows-changes instead of app state.
        // Keep using the same Id and function callback (that is extended)
        if (this._stateChangedId > 0) {
            this.app.disconnect(this._stateChangedId);
            this._stateChangedId = 0;
        }

        this._stateChangedId = this.app.connect('windows-changed',
                                                Lang.bind(this,
                                                          this.onWindowsChanged));
        this._focuseAppChangeId = tracker.connect('notify::focus-app',
                                                Lang.bind(this,
                                                          this._onFocusAppChanged));

         /* To keep compatibility with 3.14.0 and 3.14.1
         * after upstream commit 24c0a1a1d458c8d1ba1b9d3e728a27d347f7833f
         * (https://bugzilla.gnome.org/show_bug.cgi?id=739497),
         * temporary call _updateRunningStyle(). This ensure windows counter updates
         * on 3.14 and 3.14.1 where the parent not-extended method, which have
         * a different name, is called instead.
         */
         this._updateRunningStyle();
    },

    _onDestroy: function() {
        this.parent();

        // This is necessary due to an upstream bug
        // https://bugzilla.gnome.org/show_bug.cgi?id=757556
        // It can be safely removed once it get solved upstrea.
        if (this._menu)
            this._menu.close(false);

        // Disconect global signals
        // stateChangedId is already handled by parent)
        if (this._focusAppId > 0)
            tracker.disconnect(this._focusAppId);
    },

    onWindowsChanged: function() {
        this._updateRunningStyle();
        this.updateIconGeometry();
    },

    /**
     * Update taraget for minimization animation
     */
    updateIconGeometry: function() {
        // If (for unknown reason) the actor is not on the stage the reported size
        // and position are random values, which might exceeds the integer range
        // resulting in an error when assigned to the a rect. This is a more like
        // a workaround to prevent flooding the system with errors.
        if (this.actor.get_stage() == null)
            return;

        let rect = new Meta.Rectangle();

        [rect.x, rect.y] = this.actor.get_transformed_position();
        [rect.width, rect.height] = this.actor.get_transformed_size();

        let windows = this.app.get_windows();
        windows.forEach(function(w) {
            w.set_icon_geometry(rect);
        });
    },

    _updateRunningStyle: function() {

        // When using workspace isolation, we need to hide the dots of apps with
        // no windows in the current workspace
        if (this._dtdSettings.get_boolean('isolate-workspaces')) {
            if (this.app.state != Shell.AppState.STOPPED
                && getInterestingWindows(this.app, this._dtdSettings).length != 0)
                this.actor.add_style_class_name('running');
            else
                this.actor.remove_style_class_name('running');
        }
        else {
            /* To keep compatibility with 3.14.0 and 3.14.1
             * after upstream commit 24c0a1a1d458c8d1ba1b9d3e728a27d347f7833f
             * (https://bugzilla.gnome.org/show_bug.cgi?id=739497),
             * check for which method is defined
             */
            if(AppDisplay.AppIcon.prototype._updateRunningStyle)
                this.parent();
            else
                AppDisplay.AppIcon.prototype._onStateChanged.call(this);
        }

        this._updateCounterClass();
        this._onFocusAppChanged();
    },

    popupMenu: function() {
        this._removeMenuTimeout();
        this.actor.fake_release();
        this._draggable.fakeRelease();

        if (!this._menu) {
            this._menu = new MyAppIconMenu(this, this._dtdSettings);
            this._menu.connect('activate-window', Lang.bind(this, function(menu, window) {
                this.activateWindow(window);
            }));
            this._menu.connect('open-state-changed', Lang.bind(this, function(menu, isPoppedUp) {
                if (!isPoppedUp)
                    this._onMenuPoppedDown();
                else {
                    // Setting the max-height is s useful if part of the menu is
                    // scrollable so the minimum height is smaller than the natural height.
                    let monitor_index = Main.layoutManager.findIndexForActor(this.actor);
                    let workArea = Main.layoutManager.getWorkAreaForMonitor(monitor_index);
                    let position = Convenience.getPosition(this._dtdSettings);
                    this._isHorizontal = ( position == St.Side.TOP ||
                                           position == St.Side.BOTTOM);
                    // If horizontal also remove the height of the dash
                    let additional_margin = this._isHorizontal && !this._dtdSettings.get_boolean('dock-fixed') ? Main.overview._dash.actor.height : 0;
                    let verticalMargins = this._menu.actor.margin_top + this._menu.actor.margin_bottom;
                    this._menu.actor.style = ('max-height: ' + Math.round(workArea.height - additional_margin - verticalMargins) + 'px;');
                }
            }));
            let id = Main.overview.connect('hiding', Lang.bind(this, function() {
                this._menu.close();
            }));
            this._menu.actor.connect('destroy', function() {
                Main.overview.disconnect(id);
            });

            this._menuManager.addMenu(this._menu);
        }

        this.emit('menu-state-changed', true);

        this.actor.set_hover(true);
        this._menu.popup();
        this._menuManager.ignoreRelease();
        this.emit('sync-tooltip');

        return false;
    },

    _onFocusAppChanged: function() {
        if (tracker.focus_app == this.app)
            this.actor.add_style_class_name('focused');
        else
            this.actor.remove_style_class_name('focused');
    },

    activate: function(button) {

        if (!this._dtdSettings.get_boolean('customize-click')) {
            this.parent(button);
            return;
        }

        let event = Clutter.get_current_event();
        let modifiers = event ? event.get_state() : 0;
        let focusedApp = tracker.focus_app;

        // Only consider SHIFT and CONTROL as modifiers (exclude SUPER, CAPS-LOCK, etc.)
        modifiers = modifiers & (Clutter.ModifierType.SHIFT_MASK | Clutter.ModifierType.CONTROL_MASK);

        // We don't change the CTRL-click behaviour: in such case we just chain
        // up the parent method and return.
        if (modifiers & Clutter.ModifierType.CONTROL_MASK) {
                // Keep default behaviour: launch new window
                // By calling the parent method I make it compatible
                // with other extensions tweaking ctrl + click
                this.parent(button);
                return;
        }

        // We check what type of click we have and if the modifier SHIFT is
        // being used. We then define what buttonAction should be for this
        // event.
        let buttonAction = 0;
        if (button && button == 2 ) {
            if (modifiers & Clutter.ModifierType.SHIFT_MASK)
                buttonAction = this._dtdSettings.get_enum('shift-middle-click-action');
            else
                buttonAction = this._dtdSettings.get_enum('middle-click-action');
        }
        else if (button && button == 1) {
            if (modifiers & Clutter.ModifierType.SHIFT_MASK)
                buttonAction = this._dtdSettings.get_enum('shift-click-action');
            else
                buttonAction = this._dtdSettings.get_enum('click-action');
        }

        // We check if the app is running, and that the # of windows is > 0 in
        // case we use workspace isolation,
        let appIsRunning = this.app.state == Shell.AppState.RUNNING
            && getInterestingWindows(this.app, this._dtdSettings).length > 0

        // We customize the action only when the application is already running
        if (appIsRunning) {
            switch (buttonAction) {
            case clickAction.MINIMIZE:
                // In overview just activate the app, unless the acion is explicitely
                // requested with a keyboard modifier
                if (!Main.overview._shown || modifiers) {
                    // If we have button=2 or Shift, allow minimization even if
                    // the app is not focused
                    if (this.app == focusedApp || button == 2 || modifiers & Clutter.ModifierType.SHIFT_MASK) {
                        // We need to check that the focused app is actually showing,
                        // this fixes problems with minimizing with Super+d shortcut  in Gnome Shell <=3.16
                        if (global.display.get_focus_window() !== null
                            && !global.display.get_focus_window().showing_on_its_workspace())
                                activateAllWindows(this.app);
                            else {
                                // minimize all windows on double click and always in the case of primary click without
                                // additional modifiers
                                let all_windows = (button == 1 && ! modifiers) || event.get_click_count() > 1
                                minimizeWindow(this.app, all_windows, this._dtdSettings);
                            }
                    }
                    else
                        activateAllWindows(this.app, this._dtdSettings);
                }
                else
                    this.app.activate();
                break;

            case clickAction.CYCLE_WINDOWS:
                if (!Main.overview._shown){
                    if (this.app == focusedApp)
                        cycleThroughWindows(this.app, this._dtdSettings);
                    else {
                        // Activate the first window
                        let windows = getInterestingWindows(this.app, this._dtdSettings);
                        let w = windows[0];
                        Main.activateWindow(w);
                    }
                }
                else
                    this.app.activate();
                break;

            case clickAction.LAUNCH:
                this.animateLaunch();
                this.app.open_new_window(-1);
                break;

            case clickAction.QUIT:
                closeAllWindows(this.app, this._dtdSettings);
                break;

            case clickAction.SKIP:
                this.app.activate();
                break;
            }
        }
        else {
            this.animateLaunch();
            this.app.open_new_window(-1);
        }

        Main.overview.hide();
    },

    _updateCounterClass: function() {
        let maxN = 4;
        this._nWindows = Math.min(getInterestingWindows(this.app, this._dtdSettings).length, maxN);

        for (let i = 1; i <= maxN; i++) {
            let className = 'running' + i;
            if (i != this._nWindows)
                this.actor.remove_style_class_name(className);
            else
                this.actor.add_style_class_name(className);
        }
    },
});

function minimizeWindow(app, param, settings) {
    // Param true make all app windows minimize
    let windows = getInterestingWindows(app, settings);
    let current_workspace = global.screen.get_active_workspace();
    for (let i = 0; i < windows.length; i++) {
        let w = windows[i];
        if (w.get_workspace() == current_workspace && w.showing_on_its_workspace()) {
            w.minimize();
            // Just minimize one window. By specification it should be the
            // focused window on the current workspace.
            if(!param)
                break;
        }
    }
}

/**
 * By default only non minimized windows are activated.
 * This activates all windows in the current workspace.
 */
function activateAllWindows(app, settings) {
    // First activate first window so workspace is switched if needed.
    app.activate();

    // then activate all other app windows in the current workspace
    let windows = getInterestingWindows(app, settings);
    let activeWorkspace = global.screen.get_active_workspace_index();

    if (windows.length <= 0)
        return;

    let activatedWindows = 0;


    for (let i = windows.length - 1; i >= 0; i--) {
        if (windows[i].get_workspace().index() == activeWorkspace) {
            Main.activateWindow(windows[i]);
            activatedWindows++;
        }
    }
}

/**
 * This closes all windows of the app.
 */
function closeAllWindows(app, settings) {
    let windows = getInterestingWindows(app, settings);
    for (let i = 0; i < windows.length; i++)
        windows[i].delete(global.get_current_time());
}

function cycleThroughWindows(app, settings) {
    // Store for a little amount of time last clicked app and its windows
    // since the order changes upon window interaction
    let MEMORY_TIME=3000;

    let app_windows = getInterestingWindows(app, settings);

    if (recentlyClickedAppLoopId > 0)
        Mainloop.source_remove(recentlyClickedAppLoopId);
    recentlyClickedAppLoopId = Mainloop.timeout_add(MEMORY_TIME, resetRecentlyClickedApp);

    // If there isn't already a list of windows for the current app,
    // or the stored list is outdated, use the current windows list.
    if (!recentlyClickedApp ||
        recentlyClickedApp.get_id() != app.get_id() ||
        recentlyClickedAppWindows.length != app_windows.length) {
        recentlyClickedApp = app;
        recentlyClickedAppWindows = app_windows;
        recentlyClickedAppIndex = 0;
    }

    recentlyClickedAppIndex++;
    let index = recentlyClickedAppIndex % recentlyClickedAppWindows.length;
    let window = recentlyClickedAppWindows[index];

    Main.activateWindow(window);
}

function resetRecentlyClickedApp() {
    if (recentlyClickedAppLoopId > 0)
        Mainloop.source_remove(recentlyClickedAppLoopId);
    recentlyClickedAppLoopId=0;
    recentlyClickedApp =null;
    recentlyClickedAppWindows = null;
    recentlyClickedAppIndex = 0;

    return false;
}

/**
 * Extend AppIconMenu
 *
 * - Pass settings to the constructor
 * - set popup arrow side based on dash orientation
 * - Add close windows option based on quitfromdash extension
 *   (https://github.com/deuill/shell-extension-quitfromdash)
 * - Add open windows thumbnails instead of list
 */
const SHOW_WINDOWS_PREVIEW = true;
const MyAppIconMenu = new Lang.Class({
    Name: 'DashToDock.MyAppIconMenu',
    Extends: AppDisplay.AppIconMenu,

    _init: function(source, settings) {
        let side = Convenience.getPosition(settings);

        // Damm it, there has to be a proper way of doing this...
        // As I can't call the parent parent constructor (?) passing the side
        // parameter, I overwite what I need later
        this.parent(source);

        // Change the initialized side where required.
        this._arrowSide = side;
        this._boxPointer._arrowSide = side;
        this._boxPointer._userArrowSide = side;

        this._dtdSettings = settings;
    },

    _redisplay: function() {
        this.removeAll();

        if (SHOW_WINDOWS_PREVIEW) {
            // Display the app windows menu items and the separator between windows
            // of the current desktop and other windows.

            let windows = this._source.app.get_windows().filter(function(w) {
                return !w.skip_taskbar;
            });

            if (windows.length > 0) {

                this._allWindowsMenuItem = new PopupMenu.PopupSubMenuMenuItem(_('All Windows'), false);
                this.addMenuItem(this._allWindowsMenuItem);

                let activeWorkspace = global.screen.get_active_workspace();
                let separatorShown =  windows[0].get_workspace() != activeWorkspace;

                for (let i = 0; i < windows.length; i++) {
                    let window = windows[i];
                    if (!separatorShown && window.get_workspace() != activeWorkspace) {
                        this._allWindowsMenuItem.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                        separatorShown = true;
                    }

                    let item = new WindowPreview.WindowPreviewMenuItem(window);
                    this._allWindowsMenuItem.menu.addMenuItem(item);
                    item.connect('activate', Lang.bind(this, function() {
                        this.emit('activate-window', window);
                    }));

                }

                // Try to set the width to that of the submenu.
                // TODO: can't get the actual size, getting a bit less.
                // Temporary workaround: add 15px to compensate
                this._allWindowsMenuItem.actor.width =  this._allWindowsMenuItem.menu.actor.width + 15;

            }

            if (!this._source.app.is_window_backed()) {
                this._appendSeparator();

                let appInfo = this._source.app.get_app_info();
                let actions = appInfo.list_actions();
                if (this._source.app.can_open_new_window() &&
                    actions.indexOf('new-window') == -1) {
                    this._newWindowMenuItem = this._appendMenuItem(_("New Window"));
                    this._newWindowMenuItem.connect('activate', Lang.bind(this, function() {
                        if (this._source.app.state == Shell.AppState.STOPPED)
                            this._source.animateLaunch();

                        this._source.app.open_new_window(-1);
                        this.emit('activate-window', null);
                    }));
                    this._appendSeparator();
                }

                for (let i = 0; i < actions.length; i++) {
                    let action = actions[i];
                    let item = this._appendMenuItem(appInfo.get_action_name(action));
                    item.connect('activate', Lang.bind(this, function(emitter, event) {
                        this._source.app.launch_action(action, event.get_time(), -1);
                        this.emit('activate-window', null);
                    }));
                }

                let canFavorite = global.settings.is_writable('favorite-apps');

                if (canFavorite) {
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

                if (Shell.AppSystem.get_default().lookup_app('org.gnome.Software.desktop')) {
                    this._appendSeparator();
                    let item = this._appendMenuItem(_("Show Details"));
                    item.connect('activate', Lang.bind(this, function() {
                        let id = this._source.app.get_id();
                        let args = GLib.Variant.new('(ss)', [id, '']);
                        Gio.DBus.get(Gio.BusType.SESSION, null,
                            function(o, res) {
                                let bus = Gio.DBus.get_finish(res);
                                bus.call('org.gnome.Software',
                                         '/org/gnome/Software',
                                         'org.gtk.Actions', 'Activate',
                                         GLib.Variant.new('(sava{sv})',
                                                          ['details', [args], null]),
                                         null, 0, -1, null, null);
                                Main.overview.hide();
                            });
                    }));
                }
            }

        } else {
            this.parent();
        }

        // quit menu
        let app = this._source.app;
        let count = getInterestingWindows(app, this._dtdSettings).length;
        if ( count > 0) {
            this._appendSeparator();
            let quitFromDashMenuText = '';
            if (count == 1)
                quitFromDashMenuText = _('Quit');
            else
                quitFromDashMenuText = _('Quit') + ' ' + count + ' ' + _('Windows');

            this._quitfromDashMenuItem = this._appendMenuItem(quitFromDashMenuText);
            this._quitfromDashMenuItem.connect('activate', Lang.bind(this, function() {
                closeAllWindows(this._source.app, this._dtdSettings);
            }));
        }
    }
});
Signals.addSignalMethods(MyAppIconMenu.prototype);

// Filter out unnecessary windows, for instance
// nautilus desktop window.
function getInterestingWindows(app, settings) {
    let windows = app.get_windows().filter(function(w) {
        return !w.skip_taskbar;
    });

    // When using workspace isolation, we filter out windows
    // that are not in the current workspace
    if (settings.get_boolean('isolate-workspaces'))
        windows = windows.filter(function(w) {
            return w.get_workspace().index() == global.screen.get_active_workspace_index();
        });

    return windows;
}

/**
 * Extend ShowAppsIcon
 *
 * - Pass settings to the constructor
 * - set label position based on dash orientation
 * - implement a popupMenu based on the AppIcon code
 *
 *  I can't subclass the original object because of this: https://bugzilla.gnome.org/show_bug.cgi?id=688973.
 *  thus use this ugly pattern.
 */
function extendShowAppsIcon(showAppsIcon, settings) {
    showAppsIcon._dtdSettings = settings;
    /* the variable equivalent to toggleButton has a different name in the appIcon class
     (actor): duplicate reference to easily reuse appIcon methods */
    showAppsIcon.actor =  showAppsIcon.toggleButton;

    // Re-use appIcon methods
    showAppsIcon._removeMenuTimeout = AppDisplay.AppIcon.prototype._removeMenuTimeout;
    showAppsIcon._setPopupTimeout = AppDisplay.AppIcon.prototype._setPopupTimeout;
    showAppsIcon._onButtonPress = AppDisplay.AppIcon.prototype._onButtonPress;
    showAppsIcon._onKeyboardPopupMenu = AppDisplay.AppIcon.prototype._onKeyboardPopupMenu;
    showAppsIcon._onLeaveEvent = AppDisplay.AppIcon.prototype._onLeaveEvent;
    showAppsIcon._onTouchEvent = AppDisplay.AppIcon.prototype._onTouchEvent;
    showAppsIcon._onMenuPoppedDown = AppDisplay.AppIcon.prototype._onMenuPoppedDown;


    // No action on clicked (showing of the appsview is controlled elsewhere)
    showAppsIcon._onClicked = function(actor, button) {
        showAppsIcon._removeMenuTimeout();
    };

    showAppsIcon.actor.connect('leave-event', Lang.bind(showAppsIcon, showAppsIcon._onLeaveEvent));
    showAppsIcon.actor.connect('button-press-event', Lang.bind(showAppsIcon, showAppsIcon._onButtonPress));
    showAppsIcon.actor.connect('touch-event', Lang.bind(showAppsIcon, showAppsIcon._onTouchEvent));
    showAppsIcon.actor.connect('clicked', Lang.bind(showAppsIcon, showAppsIcon._onClicked));
    showAppsIcon.actor.connect('popup-menu', Lang.bind(showAppsIcon, showAppsIcon._onKeyboardPopupMenu));

    showAppsIcon._menu = null;
    showAppsIcon._menuManager = new PopupMenu.PopupMenuManager(showAppsIcon);
    showAppsIcon._menuTimeoutId = 0;

    showAppsIcon.showLabel = itemShowLabel;

    showAppsIcon.popupMenu = function() {
        showAppsIcon._removeMenuTimeout();
        showAppsIcon.actor.fake_release();

        if (!showAppsIcon._menu) {
            showAppsIcon._menu = new MyShowAppsIconMenu(showAppsIcon, showAppsIcon._dtdSettings);
            showAppsIcon._menu.connect('open-state-changed', Lang.bind(showAppsIcon, function(menu, isPoppedUp) {
                if (!isPoppedUp)
                    showAppsIcon._onMenuPoppedDown();
            }));
            let id = Main.overview.connect('hiding', Lang.bind(showAppsIcon, function() {
                showAppsIcon._menu.close();
            }));
            showAppsIcon._menu.actor.connect('destroy', function() {
                Main.overview.disconnect(id);
            });
            showAppsIcon._menuManager.addMenu(showAppsIcon._menu);
        }

        showAppsIcon.emit('menu-state-changed', true);

        showAppsIcon.actor.set_hover(true);
        showAppsIcon._menu.popup();
        showAppsIcon._menuManager.ignoreRelease();
        showAppsIcon.emit('sync-tooltip');

        return false;
    };

    Signals.addSignalMethods(showAppsIcon);
}

/**
 * A menu for the showAppsIcon
 */
const MyShowAppsIconMenu = new Lang.Class({
    Name: 'DashToDock.ShowAppsIconMenu',
    Extends: MyAppIconMenu,

    _redisplay: function() {
        this.removeAll();

        let item = this._appendMenuItem('Dash to Dock ' + _('Settings'));

        item.connect('activate', function () {
            Util.spawn(["gnome-shell-extension-prefs", Me.metadata.uuid]);
        });
    }
});

/**
 * This function is used for both extendShowAppsIcon and extendDashItemContainer
 */
function itemShowLabel()  {
    if (!this._labelText)
      return;

    this.label.set_text(this._labelText);
    this.label.opacity = 0;
    this.label.show();

    let [stageX, stageY] = this.get_transformed_position();
    let node = this.label.get_theme_node();

    let itemWidth  = this.allocation.x2 - this.allocation.x1;
    let itemHeight = this.allocation.y2 - this.allocation.y1;

    let labelWidth = this.label.get_width();
    let labelHeight = this.label.get_height();

    let x, y, xOffset, yOffset;

    let position = Convenience.getPosition(this._dtdSettings);
    this._isHorizontal = ((position == St.Side.TOP) || (position == St.Side.BOTTOM));
    let labelOffset = node.get_length('-x-offset');

    switch (position) {
    case St.Side.LEFT:
        yOffset = Math.floor((itemHeight - labelHeight) / 2);
        y = stageY + yOffset;
        xOffset = labelOffset;
        x = stageX + this.get_width() + xOffset;
        break;
    case St.Side.RIGHT:
        yOffset = Math.floor((itemHeight - labelHeight) / 2);
        y = stageY + yOffset;
        xOffset = labelOffset;
        x = Math.round(stageX) - labelWidth - xOffset;
        break;
    case St.Side.TOP:
        y = stageY + labelOffset + itemHeight;
        xOffset = Math.floor((itemWidth - labelWidth) / 2);
        x = stageX + xOffset;
        break;
    case St.Side.BOTTOM:
        yOffset = labelOffset;
        y = stageY - labelHeight - yOffset;
        xOffset = Math.floor((itemWidth - labelWidth) / 2);
        x = stageX + xOffset;
        break;
    }

    // keep the label inside the screen border
    // Only needed fot the x coordinate.

    // Leave a few pixel gap
    let gap = 5;
    let monitor = Main.layoutManager.findMonitorForActor(this);
    if (x - monitor.x < gap)
        x += monitor.x - x + labelOffset;
    else if (x + labelWidth > monitor.x + monitor.width - gap)
        x -= x + labelWidth - (monitor.x + monitor.width) + gap;

    this.label.set_position(x, y);
    Tweener.addTween(this.label, {
        opacity: 255,
        time: DASH_ITEM_LABEL_SHOW_TIME,
        transition: 'easeOutQuad',
    });
}
