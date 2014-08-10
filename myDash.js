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

/* This class is a extension of the upstream DashItemContainer class (ui.dash.js).
 * Changes are done to make label shows on top side. SOURCE: simple-dock extension.
 */
const showHoverLabelTop = function() {
    	
    if (!this._labelText) {
        return;
    }

    this.label.set_text(this._labelText);
    this.label.opacity = 0;
    this.label.show();

    let [stageX, stageY] = this.get_transformed_position();

    let labelHeight = this.label.get_height();
    let labelWidth = this.label.get_width();

    let node = this.label.get_theme_node();
    let yOffset = node.get_length('-x-offset');

    let y = stageY - labelHeight - yOffset;

    let itemWidth = this.allocation.x2 - this.allocation.x1;
    let xOffset = Math.floor((itemWidth - labelWidth) / 2);

    let x = stageX + xOffset;

    this.label.set_position(x, y);

    Tweener.addTween(this.label, {
        opacity: 255,
        time: DASH_ITEM_LABEL_SHOW_TIME,
        transition: 'easeOutQuad',
    });
};

/* 
 * This class is a extension of the upstream DashItemContainer class (ui.dash.js).
 * Changes are done to make label shows on top side. SOURCE: simple-dock extension.
 */
const myDashItemContainer = new Lang.Class({
    Name: 'myDashItemContainer',
    Extends: Dash.DashItemContainer,

    _init: function() {
        this.parent();
    },

	showLabel: showHoverLabelTop
});

/* This class is a extension of the upstream ShowAppsIcon class (ui.dash.js).
 * Changes are done to make label shows on top side.
 */
const myShowAppsIcon = new Lang.Class({
    Name: 'myShowAppsIcon',
    Extends: Dash.ShowAppsIcon,

    _init: function() {
        this.parent();
    },

	showLabel: showHoverLabelTop
});

/* This class is a fork of the upstream DashActor class (ui.dash.js)
 *
 * Summary of changes:
 * - passed settings to class as parameter
 * - modified chldBox calculations for when 'show-apps-at-top' option is checked
 *
 */
const myDashActor = new Lang.Class({
    Name: 'DashToDockmyDashActor',
    Extends: St.Widget,

    _init: function(settings) {
        this._settings = settings;
        
        let layout;
        if (!dock_horizontal) {
			layout = new Clutter.BoxLayout({ orientation: Clutter.Orientation.VERTICAL });
		} else {
			layout = new Clutter.BoxLayout({ orientation: Clutter.Orientation.HORIZONTAL });
		}
        this.parent({ name: 'dash',
                      layout_manager: layout,
                      clip_to_allocation: true });
    },

    vfunc_allocate: function(box, flags) {	
        let contentBox = this.get_theme_node().get_content_box(box);
        let availWidth = contentBox.x2 - contentBox.x1;        
        let availHeight = contentBox.y2 - contentBox.y1;

        this.set_allocation(box, flags);

        let [appIcons, showAppsButton] = this.get_children();
 
        let childBox = new Clutter.ActorBox();
		if (!dock_horizontal) {
			let [showAppsMinHeight, showAppsNatHeight] = showAppsButton.get_preferred_height(availWidth);
			if( this._settings.get_boolean('show-apps-at-top') ) {
				childBox.x1 = contentBox.x1;
				childBox.y1 = contentBox.y1 + showAppsNatHeight;
				childBox.x2 = contentBox.x2;
				childBox.y2 = contentBox.y2;
				appIcons.allocate(childBox, flags);

				childBox.y1 = contentBox.y1;
				childBox.y2 = contentBox.y1 + showAppsNatHeight;
				showAppsButton.allocate(childBox, flags);           
			} else {
				childBox.x1 = contentBox.x1;
				childBox.y1 = contentBox.y1;
				childBox.x2 = contentBox.x2;
				childBox.y2 = contentBox.y2 - showAppsNatHeight;
				appIcons.allocate(childBox, flags);

				childBox.y1 = contentBox.y2 - showAppsNatHeight;
				childBox.y2 = contentBox.y2;
				showAppsButton.allocate(childBox, flags);          
			}
		} else {
			let [showAppsMinWidth, showAppsNatWidth] = showAppsButton.get_preferred_height(availWidth);
			if( this._settings.get_boolean('show-apps-at-top') ) {
				childBox.x1 = contentBox.x1 + showAppsNatWidth;
				childBox.y1 = contentBox.y1;
				childBox.x2 = contentBox.x2;
				childBox.y2 = contentBox.y2;		
				appIcons.allocate(childBox, flags);

				childBox.x1 = contentBox.x1;
				childBox.x2 = contentBox.x1 + showAppsNatWidth;
				showAppsButton.allocate(childBox, flags);				
			} else {
				childBox.x1 = contentBox.x1;
				childBox.y1 = contentBox.y1;
				childBox.x2 = contentBox.x2 - showAppsNatWidth;
				childBox.y2 = contentBox.y2;
				appIcons.allocate(childBox, flags);

				childBox.x1 = contentBox.x2 - showAppsNatWidth;
				childBox.x2 = contentBox.x2;
				showAppsButton.allocate(childBox, flags);            
			}
		}	
    },
	
    vfunc_get_preferred_height: function(forWidth) {
        // We want to request the natural height of all our children
        // as our natural height, so we chain up to StWidget (which
        // then calls BoxLayout), but we only request the showApps
        // button as the minimum size
        
        let [, natHeight] = this.parent(forWidth);

        let themeNode = this.get_theme_node();
        let adjustedForWidth = themeNode.adjust_for_width(forWidth);
        let [, showAppsButton] = this.get_children();
        let [minHeight, ] = showAppsButton.get_preferred_height(adjustedForWidth);
        [minHeight, ] = themeNode.adjust_preferred_height(minHeight, natHeight);

        return [minHeight, natHeight];
    }
});

/* This class is a fork of the upstream dash class (ui.dash.js)
 *
 * Summary of changes:
 * - disconnect global signals adding a destroy method;
 * - play animations even when not in overview mode
 * - set a maximum icon size
 * - show running and/or favorite applications
 * - emit a custom signal when an app icon is added
 *
 */
const myDash = new Lang.Class({
    Name: 'dashToDock.myDash',

    _init: function(settings) {	
		this._settings = settings;
		
		if (this._settings.get_int('dock-placement') == 0 || this._settings.get_int('dock-placement') == 1)
			dock_horizontal = false;
		else
			dock_horizontal = true;
        
        this._signalHandler = new Convenience.globalSignalHandler();				
        this._maxWidth = -1;        
		this._maxHeight = -1;
        this.iconSize = this._settings.get_int('dash-max-icon-size');
        this._avaiableIconSize = Dash.baseIconSizes;
        this._shownInitially = false;

        this._dragPlaceholder = null;
        this._dragPlaceholderPos = -1;
        this._animatingPlaceholdersCount = 0;
        this._showLabelTimeoutId = 0;
        this._resetHoverTimeoutId = 0;
        this._labelShowing = false;

        this._container = new myDashActor(settings);
        this._box;
        if (!dock_horizontal) {
			this._box = new St.BoxLayout({ vertical: true, clip_to_allocation: false });
		} else {
			this._box = new St.BoxLayout({ vertical: false, clip_to_allocation: false });
		}
		this._box._delegate = this;

		this._scrollView = new St.ScrollView({ x_expand: true, y_expand: true,
                                               x_fill: true, y_fill: false, reactive: true });

		this._leftOrTopArrow = new St.Button();
		this._rightOrBottomArrow = new St.Button();

        if (!dock_horizontal) {
			this._scrollView.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC);
			this._scrollView.vscroll.hide();

			this._appsContainer = new St.BoxLayout({ vertical: true, clip_to_allocation: false });

			this._leftOrTopArrowIcon = new St.Icon({ icon_name: 'go-up-symbolic', icon_size: 16 });
			this._leftOrTopArrow.set_child(this._leftOrTopArrowIcon);
			this._appsContainer.add_actor(this._leftOrTopArrow);
			this._leftOrTopArrow.connect('clicked', Lang.bind(this, this._onScrollBtnLeftOrTop));		

			this._scrollView.add_actor(this._box);
			this._appsContainer.add_actor(this._scrollView);
			
			this._rightOrBottomArrowIcon = new St.Icon({ icon_name: 'go-down-symbolic', icon_size: 16});
			this._rightOrBottomArrow.set_child(this._rightOrBottomArrowIcon);
			this._appsContainer.add_actor(this._rightOrBottomArrow);
			this._rightOrBottomArrow.connect('clicked', Lang.bind(this, this._onScrollBtnRightOrBottom));
		} else {
			this._scrollView.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.NEVER);
			this._scrollView.hscroll.hide();

			this._appsContainer = new St.BoxLayout({ vertical: false, clip_to_allocation: false });

			this._leftOrTopArrowIcon = new St.Icon({ icon_name: 'go-previous-symbolic', icon_size: 16 });
			this._leftOrTopArrow.set_child(this._leftOrTopArrowIcon);
			this._appsContainer.add_actor(this._leftOrTopArrow);
			this._leftOrTopArrow.connect('clicked', Lang.bind(this, this._onScrollBtnLeftOrTop));		

			this._scrollView.add_actor(this._box);
			this._appsContainer.add_actor(this._scrollView);
			
			this._rightOrBottomArrowIcon = new St.Icon({ icon_name: 'go-next-symbolic', icon_size: 16});
			this._rightOrBottomArrow.set_child(this._rightOrBottomArrowIcon);
			this._appsContainer.add_actor(this._rightOrBottomArrow);
			this._rightOrBottomArrow.connect('clicked', Lang.bind(this, this._onScrollBtnRightOrBottom));			
		}
		this._container.add_actor(this._appsContainer);

		if (!dock_horizontal) {
			this._showAppsIcon = new Dash.ShowAppsIcon();
		} else {		
			this._showAppsIcon = new myShowAppsIcon();
		}

        this._showAppsIcon.childScale = 1;
        this._showAppsIcon.childOpacity = 255;
        this._showAppsIcon.icon.setIconSize(this.iconSize);
        this._hookUpLabel(this._showAppsIcon);

        this.showAppsButton = this._showAppsIcon.toggleButton;

        this._container.add_actor(this._showAppsIcon);
        
        this.actor = new St.Bin({ child: this._container, y_align: St.Align.START });
        
        this._workId = Main.initializeDeferredWork(this._box, Lang.bind(this, this._redisplay));

        this._appSystem = Shell.AppSystem.get_default();

        this._signalHandler.push(
            [
                this._appSystem,
                'installed-changed',
                Lang.bind(this, function() {
                    AppFavorites.getAppFavorites().reload();
                    this._queueRedisplay();
                })
            ],
            [
                AppFavorites.getAppFavorites(),
                'changed',
                Lang.bind(this, this._queueRedisplay)
            ],
            [
                this._appSystem,
                'app-state-changed',
                Lang.bind(this, this._queueRedisplay)
            ],
            [
                Main.overview,
                'item-drag-begin',
                Lang.bind(this, this._onDragBegin)
            ],
            [
                Main.overview,
                'item-drag-end',
                Lang.bind(this, this._onDragEnd)
            ],
            [
                Main.overview,
                'item-drag-cancelled',
                Lang.bind(this, this._onDragCancelled)
            ]
        );

        this.setMaxIconSize(this._settings.get_int('dash-max-icon-size'));
    },

    destroy: function() {
        this._signalHandler.disconnect();
    },
    
    _onScrollBtnLeftOrTop: function() {
		if (!dock_horizontal) {
			let vscroll = this._scrollView.get_vscroll_bar();
			vscroll.get_adjustment().set_value(vscroll.get_adjustment().get_value() - this._scrollView.height);				
		} else {
			let hscroll = this._scrollView.get_hscroll_bar();
			hscroll.get_adjustment().set_value(hscroll.get_adjustment().get_value() - this._scrollView.width);	
		}
    },
    
    _onScrollBtnRightOrBottom: function() {
		if (!dock_horizontal) {
			let vscroll = this._scrollView.get_vscroll_bar();
			vscroll.get_adjustment().set_value(vscroll.get_adjustment().get_value() + this._scrollView.height);				
		} else {
			let hscroll = this._scrollView.get_hscroll_bar();
			hscroll.get_adjustment().set_value(hscroll.get_adjustment().get_value() + this._scrollView.width);	
		}
    },
        
    _onDragBegin: function() {
        this._dragCancelled = false;
        this._dragMonitor = {
            dragMotion: Lang.bind(this, this._onDragMotion)
        };
        DND.addDragMonitor(this._dragMonitor);

        if (this._box.get_n_children() == 0) {
            this._emptyDropTarget = new Dash.EmptyDropTargetItem();
            this._box.insert_child_at_index(this._emptyDropTarget, 0);
            this._emptyDropTarget.show(true);
        }
    },

    _onDragCancelled: function() {
        this._dragCancelled = true;
        this._endDrag();
    },

    _onDragEnd: function() {
        if (this._dragCancelled)
            return;

        this._endDrag();
    },

    _endDrag: function() {
        this._clearDragPlaceholder();
        this._clearEmptyDropTarget();
        this._showAppsIcon.setDragApp(null);
        DND.removeDragMonitor(this._dragMonitor);
    },

    _onDragMotion: function(dragEvent) {
        let app = Dash.getAppFromSource(dragEvent.source);
        if (app == null)
            return DND.DragMotionResult.CONTINUE;

        let showAppsHovered = this._showAppsIcon.contains(dragEvent.targetActor);

        if (!this._box.contains(dragEvent.targetActor) || showAppsHovered)
            this._clearDragPlaceholder();

        if (showAppsHovered)
            this._showAppsIcon.setDragApp(app);
        else
            this._showAppsIcon.setDragApp(null);

        return DND.DragMotionResult.CONTINUE;
    },

    _appIdListToHash: function(apps) {
        let ids = {};
        for (let i = 0; i < apps.length; i++)
            ids[apps[i].get_id()] = apps[i];
        return ids;
    },

    _queueRedisplay: function () {
        Main.queueDeferredWork(this._workId);
    },

    _hookUpLabel: function(item, appIcon) {
        item.child.connect('notify::hover', Lang.bind(this, function() {
            this._syncLabel(item, appIcon);
        }));

        Main.overview.connect('hiding', Lang.bind(this, function() {
            this._labelShowing = false;
            item.hideLabel();
        }));

        if (appIcon) {
            appIcon.connect('sync-tooltip', Lang.bind(this, function() {
                this._syncLabel(item, appIcon);
            }));
        }
    },

    _createAppItem: function(app) {
		let appIcon = new myAppIcon(this._settings, app, 
			{ setSizeManually: true, showLabel: false });
        appIcon._draggable.connect('drag-begin',
			Lang.bind(this, function() {
				appIcon.actor.opacity = 50;
			}));
        appIcon._draggable.connect('drag-end',
			Lang.bind(this, function() {
				appIcon.actor.opacity = 255;
			}));
        appIcon.connect('menu-state-changed',
			Lang.bind(this, function(appIcon, opened) {
				this._itemMenuStateChanged(item, opened);
			}));

		let item;	
		if (!dock_horizontal) {
			item = new Dash.DashItemContainer();
		} else {
			item = new myDashItemContainer();
		}
		
        item.setChild(appIcon.actor);

        // Override default AppIcon label_actor, now the
        // accessible_name is set at DashItemContainer.setLabelText
        appIcon.actor.label_actor = null;
        item.setLabelText(app.get_name());

        appIcon.icon.setIconSize(this.iconSize);
        this._hookUpLabel(item, appIcon);

        return item;
    },

    _itemMenuStateChanged: function(item, opened) {
        // When the menu closes, it calls sync_hover, which means
        // that the notify::hover handler does everything we need to.
        if (opened) {
            if (this._showLabelTimeoutId > 0) {
                Mainloop.source_remove(this._showLabelTimeoutId);
                this._showLabelTimeoutId = 0;
            }

            item.hideLabel();
        } else {
            // I want to listen from outside when a menu is closed. I used to
            // add a custom signal to the appIcon, since gnome 3.8 the signal
            // calling this callback was added upstream.
            this.emit('menu-closed');
        }
    },

    _syncLabel: function (item, appIcon) {
        let shouldShow = appIcon ? appIcon.shouldShowTooltip() : item.child.get_hover();

        if (shouldShow) {
            if (this._showLabelTimeoutId == 0) {
                let timeout = this._labelShowing ? 0 : DASH_ITEM_HOVER_TIMEOUT;
                this._showLabelTimeoutId = Mainloop.timeout_add(timeout,
                    Lang.bind(this, function() {
                        this._labelShowing = true;
                        item.showLabel();
                        this._showLabelTimeoutId = 0;
                        return GLib.SOURCE_REMOVE;
                    }));
                if (this._resetHoverTimeoutId > 0) {
                    Mainloop.source_remove(this._resetHoverTimeoutId);
                    this._resetHoverTimeoutId = 0;
                }
            }
        } else {
            if (this._showLabelTimeoutId > 0)
                Mainloop.source_remove(this._showLabelTimeoutId);
            this._showLabelTimeoutId = 0;
            item.hideLabel();
            if (this._labelShowing) {
                this._resetHoverTimeoutId = Mainloop.timeout_add(DASH_ITEM_HOVER_TIMEOUT,
                    Lang.bind(this, function() {
                        this._labelShowing = false;
                        this._resetHoverTimeoutId = 0;
                        return GLib.SOURCE_REMOVE;
                    }));
            }
        }
    },

    _adjustIconSize: function() {	
        // For the icon size, we only consider children which are "proper"
        // icons (i.e. ignoring drag placeholders) and which are not
        // animating out (which means they will be destroyed at the end of
        // the animation)
        let iconChildren = this._box.get_children().filter(function(actor) {
            return actor.child &&
                   actor.child._delegate &&
                   actor.child._delegate.icon &&
                   !actor.animatingOut;
        });

        iconChildren.push(this._showAppsIcon);

        if(!this._container.get_stage())
            return;
	
        let themeNode = this._container.get_theme_node();
        let maxAllocation;
		if (!dock_horizontal) {
			maxAllocation = new Clutter.ActorBox({ x1: 0, y1: 0,
				x2: 64, y2: this._maxHeight });
		} else {
			maxAllocation = new Clutter.ActorBox({ x1: 0, y1: 0,
				x2: this._maxWidth, y2: 64});
		}
        let maxContent = themeNode.get_content_box(maxAllocation);
        let availWidth, availHeight;
		if (!dock_horizontal) {
			availHeight = maxContent.y2 - maxContent.y1;
		} else {
			availWidth = maxContent.x2 - maxContent.x1;		
		}
        let spacing = themeNode.get_length('spacing');

        let firstButton = iconChildren[0].child;
        let firstIcon = firstButton._delegate.icon;

        let minWidth, natWidth, minHeight, natHeight;

        // Enforce the current icon size during the size request      
        firstIcon.setIconSize(this.iconSize);
        [minWidth, natWidth] = firstButton.get_preferred_width(-1);
		[minHeight, natHeight] = firstButton.get_preferred_height(-1);

        let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let iconSizes = Dash.baseIconSizes.map(function(s) {
            return s * scaleFactor;
        });
		let availSize;
		if (!dock_horizontal) {
			// Subtract icon padding and box spacing from the available height
			availHeight -= iconChildren.length * (natHeight - this.iconSize * scaleFactor) +
						   (iconChildren.length - 1) * spacing;

			availSize = availHeight / iconChildren.length;
		} else {
			// Subtract icon padding and box spacing from the available width
			availWidth -= iconChildren.length * (natWidth - this.iconSize * scaleFactor) +
				(iconChildren.length - 1) * spacing;                       

			availSize = availWidth / iconChildren.length;
		}

        let iconSizes = this._avaiableIconSize;
		let newIconSize = this._settings.get_int('dash-max-icon-size');

        if (newIconSize == this.iconSize)
            return;

        let oldIconSize = this.iconSize;
        this.iconSize = newIconSize;
        this.emit('icon-size-changed');

        let scale = oldIconSize / newIconSize;
        for (let i = 0; i < iconChildren.length; i++) {
            let icon = iconChildren[i].child._delegate.icon;

            // Set the new size immediately, to keep the icons' sizes
            // in sync with this.iconSize
            icon.setIconSize(this.iconSize);

            // Don't animate the icon size change when the overview
            // is transitioning, or when initially filling
            // the dash
            if (Main.overview.animationInProgress ||
                !this._shownInitially)
                continue;

            let [targetWidth, targetHeight] = icon.icon.get_size();

            // Scale the icon's texture to the previous size and
            // tween to the new size
            icon.icon.set_size(icon.icon.width * scale,
                               icon.icon.height * scale);

            Tweener.addTween(icon.icon,
                             { width: targetWidth,
                               height: targetHeight,
                               time: DASH_ANIMATION_TIME,
                               transition: 'easeOutQuad',
                             });                          
        }     
    },

    _redisplay: function () {
        let favorites = AppFavorites.getAppFavorites().getFavoriteMap();

        let running = this._appSystem.get_running();

        let children = this._box.get_children().filter(function(actor) {
                return actor.child &&
                       actor.child._delegate &&
                       actor.child._delegate.app;
		});
        // Apps currently in the dash
        let oldApps = children.map(function(actor) {
                return actor.child._delegate.app;
            });
        // Apps supposed to be in the dash
        let newApps = [];

        if( this._settings.get_boolean('show-favorites') ) {
            for (let id in favorites)
                newApps.push(favorites[id]);
        }

        if( this._settings.get_boolean('show-running') ) {
            for (let i = 0; i < running.length; i++) {
                let app = running[i];
                if (this._settings.get_boolean('show-favorites') && (app.get_id() in favorites) )
                    continue;
                newApps.push(app);
            }
        }

        // Figure out the actual changes to the list of items; we iterate
        // over both the list of items currently in the dash and the list
        // of items expected there, and collect additions and removals.
        // Moves are both an addition and a removal, where the order of
        // the operations depends on whether we encounter the position
        // where the item has been added first or the one from where it
        // was removed.
        // There is an assumption that only one item is moved at a given
        // time; when moving several items at once, everything will still
        // end up at the right position, but there might be additional
        // additions/removals (e.g. it might remove all the launchers
        // and add them back in the new order even if a smaller set of
        // additions and removals is possible).
        // If above assumptions turns out to be a problem, we might need
        // to use a more sophisticated algorithm, e.g. Longest Common
        // Subsequence as used by diff.
        let addedItems = [];
        let removedActors = [];

        let newIndex = 0;
        let oldIndex = 0;
        while (newIndex < newApps.length || oldIndex < oldApps.length) {
            // No change at oldIndex/newIndex
            if (oldApps[oldIndex] == newApps[newIndex]) {
                oldIndex++;
                newIndex++;
                continue;
            }

            // App removed at oldIndex
            if (oldApps[oldIndex] &&
                newApps.indexOf(oldApps[oldIndex]) == -1) {
                removedActors.push(children[oldIndex]);
                oldIndex++;
                continue;
            }

            // App added at newIndex
            if (newApps[newIndex] &&
                oldApps.indexOf(newApps[newIndex]) == -1) {
                addedItems.push({ app: newApps[newIndex],
                                  item: this._createAppItem(newApps[newIndex]),
                                  pos: newIndex });
                newIndex++;
                continue;
            }

            // App moved
            let insertHere = newApps[newIndex + 1] &&
                             newApps[newIndex + 1] == oldApps[oldIndex];
            let alreadyRemoved = removedActors.reduce(function(result, actor) {
                let removedApp = actor.child._delegate.app;
                return result || removedApp == newApps[newIndex];
            }, false);

            if (insertHere || alreadyRemoved) {
                let newItem = this._createAppItem(newApps[newIndex]);
                addedItems.push({ app: newApps[newIndex],
                                  item: newItem,
                                  pos: newIndex + removedActors.length });
                newIndex++;
            } else {
                removedActors.push(children[oldIndex]);
                oldIndex++;
            }
        }

        for (let i = 0; i < addedItems.length; i++)
            this._box.insert_child_at_index(addedItems[i].item,
                                            addedItems[i].pos);

        for (let i = 0; i < removedActors.length; i++) {
            let item = removedActors[i];

            // Don't animate item removal when the overview is transitioning
            if (!Main.overview.animationInProgress)
                item.animateOutAndDestroy();
            else
                item.destroy();
        }

        this._adjustIconSize();

        for (let i = 0; i < addedItems.length; i++){
            // Emit a custom signal notifying that a new item has been added
            this.emit('item-added', addedItems[i]);
        }

        // Skip animations on first run when adding the initial set
        // of items, to avoid all items zooming in at once

        let animate = this._shownInitially && Main.overview.visible &&
            !Main.overview.animationInProgress;

        if (!this._shownInitially)
            this._shownInitially = true;

        for (let i = 0; i < addedItems.length; i++) {
            addedItems[i].item.show(animate);
        }

        // Workaround for https://bugzilla.gnome.org/show_bug.cgi?id=692744
        // Without it, StBoxLayout may use a stale size cache
        this._box.queue_relayout();

		// Hiding/showing the arrows if required
		if(this._container.get_stage()) {
			if (!dock_horizontal) {
				if (this._scrollView.get_vscroll_bar().height > this._box.height) {
					this._leftOrTopArrow.hide();
					this._rightOrBottomArrow.hide();
				} else {
					this._leftOrTopArrow.show();
					this._rightOrBottomArrow.show();					
				}
			} else {
				if (this._scrollView.get_hscroll_bar().width > this._box.width) {
					this._leftOrTopArrow.hide();
					this._rightOrBottomArrow.hide();
				} else {
					this._leftOrTopArrow.show();
					this._rightOrBottomArrow.show();					
				}
			}
		}
    },

    setMaxIconSize: function(size) {

        if( size>=Dash.baseIconSizes[0] ){

            this._avaiableIconSize = Dash.baseIconSizes.filter(
                function(val){				
                    return (val<=size);
                }
            );

        } else {			
            this._availableIconSize = [ Dash.baseIconSizes[0] ];
        }

        // Changing too rapidly icon size settings cause the whole Shell to freeze
        // I've not discovered exactly why, but disabling animation by setting
        // shownInitially prevent the freeze from occuring
        this._shownInitially = false;

        this._redisplay();

    },

    // Reset the displayed apps icon to mantain the correct order when changing
    // show favorites/show running settings
    resetAppIcons : function() {

        let children = this._box.get_children().filter(function(actor) {
            return actor.child &&
                actor.child._delegate &&
                actor.child._delegate.icon;
        });
        for (let i = 0; i < children.length; i++) {
            let item = children[i];
            item.destroy();
        }

        // to avoid ugly animations, just suppress them like when dash is first loaded.
        this._shownInitially = false;
        this._redisplay();

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

    _clearEmptyDropTarget: function() {
        if (this._emptyDropTarget) {
            this._emptyDropTarget.animateOutAndDestroy();
            this._emptyDropTarget = null;
        }
    },

    handleDragOver : function(source, actor, x, y, time) {

        // Don't allow to add favourites if they are not displayed
        if( !this._settings.get_boolean('show-favorites') )
            return DND.DragMotionResult.NO_DROP;

        let app = Dash.getAppFromSource(source);

        // Don't allow favoriting of transient apps
        if (app == null || app.is_window_backed())
            return DND.DragMotionResult.NO_DROP;

        let favorites = AppFavorites.getAppFavorites().getFavorites();
        let numFavorites = favorites.length;

        let favPos = favorites.indexOf(app);

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

			if (!this._emptyDropTarget){
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

        if (pos != this._dragPlaceholderPos && pos <= numFavorites && this._animatingPlaceholdersCount == 0) {
            this._dragPlaceholderPos = pos;

            // Don't allow positioning before or after self
            if (favPos != -1 && (pos == favPos || pos == favPos + 1)) {
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
        // "favorites zone"
        if (pos > numFavorites)
            this._clearDragPlaceholder();

        if (!this._dragPlaceholder)
            return DND.DragMotionResult.NO_DROP;

        let srcIsFavorite = (favPos != -1);

        if (srcIsFavorite)
            return DND.DragMotionResult.MOVE_DROP;

        return DND.DragMotionResult.COPY_DROP;
    },

    // Draggable target interface
    acceptDrop : function(source, actor, x, y, time) {

        // Don't allow to add favourites if they are not displayed
        if( !this._settings.get_boolean('show-favorites') )
            return true;

        let app = Dash.getAppFromSource(source);

        // Don't allow favoriting of transient apps
        if (app == null || app.is_window_backed()) {
            return false;
        }

        let id = app.get_id();

        let favorites = AppFavorites.getAppFavorites().getFavoriteMap();

        let srcIsFavorite = (id in favorites);

        let favPos = 0;
        let children = this._box.get_children();
        for (let i = 0; i < this._dragPlaceholderPos; i++) {
            if (this._dragPlaceholder &&
                children[i] == this._dragPlaceholder)
                continue;

            let childId = children[i].child._delegate.app.get_id();
            if (childId == id)
                continue;
            if (childId in favorites)
                favPos++;
        }

        // No drag placeholder means we don't wan't to favorite the app
        // and we are dragging it to its original position
        if (!this._dragPlaceholder)
            return true;

        Meta.later_add(Meta.LaterType.BEFORE_REDRAW, Lang.bind(this,
            function () {
                let appFavorites = AppFavorites.getAppFavorites();
                if (srcIsFavorite)
                    appFavorites.moveFavoriteToPos(id, favPos);
                else
                    appFavorites.addFavoriteAtPos(id, favPos);
                return false;
            }));

        return true;
    }
});

Signals.addSignalMethods(myDash.prototype);


/**
 * Extend AppIcon
 *
 * - Pass settings to the constructor and bind settings changes
 * - Apply a css class based on the number of windows of each application (#N);
 *   a class of the form "running#N" is applied to the AppWellIcon actor.
 *   like the original .running one.
 * - add a .focused style to the focused app
 * - Customize click actions.
 *
 */

let tracker = Shell.WindowTracker.get_default();

const clickAction = {
    SKIP: 0,
    MINIMIZE: 1,
    LAUNCH: 2,
    CYCLE_WINDOWS: 3
};

let recentlyClickedAppLoopId = 0;
let recentlyClickedApp = null;
let recentlyClickedAppWindows = null;
let recentlyClickedAppIndex = 0;

const myAppIcon = new Lang.Class({
    Name: 'dashToDock.AppIcon',
    Extends: AppDisplay.AppIcon,

    // settings are required inside.
    _init: function(settings, app, iconParams, onActivateOverride) {

        this._settings = settings;
        this._maxN =4;

        this.parent(app, iconParams, onActivateOverride);

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
			if (!dock_horizontal) {
				this._menu = new AppDisplay.AppIconMenu(this);
			} else {				
				this._menu = new myAppIconMenu(this);				
			}


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

                if(this._settings.get_enum('click-action') == clickAction.CYCLE_WINDOWS){
                    this.emit('launching');
                    cycleThroughWindows(this.app);

                } else if(this._settings.get_enum('click-action') == clickAction.MINIMIZE)
                    minimizeWindow(this.app, true);

                else if(this._settings.get_enum('click-action') == clickAction.LAUNCH){
                    this.emit('launching');
                    this.app.open_new_window(-1);
                }

            } else {
                // Activate all window of the app or only le last used
                this.emit('launching');
                if (this._settings.get_enum('click-action') == clickAction.CYCLE_WINDOWS && !Main.overview._shown){
                    // If click cycles through windows I can activate one windows at a time
                    let windows = getAppInterestingWindows(this.app);
                    let w = windows[0];
                    Main.activateWindow(w);
                } else if(this._settings.get_enum('click-action') == clickAction.LAUNCH)
                    this.app.open_new_window(-1);
                else if(this._settings.get_enum('click-action') == clickAction.MINIMIZE){
                    // If click minimizes all, then one expects all windows to be reshown
                    activateAllWindows(this.app);
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

        let n = getAppInterestingWindows(this.app).length;

        if(n>this._maxN)
             n = this._maxN;

        for(let i = 1; i<=this._maxN; i++){
            let className = 'running'+i;
            if(i!=n)
                this.actor.remove_style_class_name(className);
            else
                this.actor.add_style_class_name(className);
        }
    }
});

Signals.addSignalMethods(myAppIcon.prototype);

// This class is a extension of the upstream AppIcon class (ui.appDisplay.js).
const myAppIconMenu = new Lang.Class({
    Name: 'AppIconMenu',
    Extends: AppDisplay.PopupMenu.PopupMenu,

    _init: function(source) {
        let side = St.Side.TOP;
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

function minimizeWindow(app, param){
    // Param true make all app windows minimize
    let windows = getAppInterestingWindows(app);
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
}

/*
 * By default only non minimized windows are activated.
 * This activates all windows in the current workspace.
 */
function activateAllWindows(app){

    // First activate first window so workspace is switched if needed.
    app.activate();

    // then activate all other app windows in the current workspace
    let windows = getAppInterestingWindows(app);
    let activeWorkspace = global.screen.get_active_workspace_index();

    if( windows.length<=0)
        return;

    let activatedWindows = 0;

    for (let i=windows.length-1; i>=0; i--){
        if(windows[i].get_workspace().index() == activeWorkspace){
            Main.activateWindow(windows[i]);
            activatedWindows++;
        }
    }
}

function cycleThroughWindows(app) {

    // Store for a little amount of time last clicked app and its windows
    // since the order changes upon window interaction
    let MEMORY_TIME=3000;

    let app_windows = getAppInterestingWindows(app);

    if(recentlyClickedAppLoopId>0)
        Mainloop.source_remove(recentlyClickedAppLoopId);
    recentlyClickedAppLoopId = Mainloop.timeout_add(MEMORY_TIME, resetRecentlyClickedApp);

    // If there isn't already a list of windows for the current app,
    // or the stored list is outdated, use the current windows list.
    if( !recentlyClickedApp ||
        recentlyClickedApp.get_id() != app.get_id() ||
        recentlyClickedAppWindows.length != app_windows.length
      ){

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

    if(recentlyClickedAppLoopId>0)
        Mainloop.source_remove(recentlyClickedAppLoopId);
    recentlyClickedAppLoopId=0;
    recentlyClickedApp =null;
    recentlyClickedAppWindows = null;
    recentlyClickedAppIndex = 0;

    return false;
}

function getAppInterestingWindows(app) {
    // Filter out unnecessary windows, for instance
    // nautilus desktop window.
    let windows = app.get_windows().filter(function(w) {
        return !w.skip_taskbar;
    });

    return windows;
}
