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
//const Dash = imports.ui.dash;
const DND = imports.ui.dnd;

const IconGrid = imports.ui.iconGrid;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Workspace = imports.ui.workspace;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Widgets = Me.imports.widgets;

let DASH_ANIMATION_TIME = 0.2;
let DASH_ITEM_LABEL_SHOW_TIME = 0.15;
let DASH_ITEM_LABEL_HIDE_TIME = 0.1;
let DASH_ITEM_HOVER_TIMEOUT = 300;

let dock_horizontal = true;

/* This class is a extension of the upstream DashItemContainer class (ui.dash.js).
 * Changes were made to make the label show on the top. SOURCE: simple-dock extension.
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

function getAppFromSource(source) {
    if (source instanceof AppDisplay.AppIcon) {
        return source.app;
    } else {
        return null;
    }
}

const myDashItemContainer = new Lang.Class({
    Name: 'myDashItemContainer',
    Extends: St.Widget,

    _init: function() {
        this.parent({ style_class: 'dash-item-container' });

        this._labelText = "";
        this.label = new St.Label({ style_class: 'dash-label'});
        this.label.hide();
        Main.layoutManager.addChrome(this.label);
        this.label_actor = this.label;

        this.child = null;
        this._childScale = 0;
        this._childOpacity = 0;
        this.animatingOut = false;
    },

    vfunc_allocate: function(box, flags) {
        this.set_allocation(box, flags);

        if (this.child == null)
            return;

        let availWidth = box.x2 - box.x1;
        let availHeight = box.y2 - box.y1;
        let [minChildWidth, minChildHeight, natChildWidth, natChildHeight] =
            this.child.get_preferred_size();
        let [childScaleX, childScaleY] = this.child.get_scale();

        let childWidth = Math.min(natChildWidth * childScaleX, availWidth);
        let childHeight = Math.min(natChildHeight * childScaleY, availHeight);

        let childBox = new Clutter.ActorBox();
        childBox.x1 = (availWidth - childWidth) / 2;
        childBox.y1 = (availHeight - childHeight) / 2;
        childBox.x2 = childBox.x1 + childWidth;
        childBox.y2 = childBox.y1 + childHeight;

        this.child.allocate(childBox, flags);
    },

    vfunc_get_preferred_height: function(forWidth) {
        let themeNode = this.get_theme_node();

        if (this.child == null)
            return [0, 0];

        forWidth = themeNode.adjust_for_width(forWidth);
        let [minHeight, natHeight] = this.child.get_preferred_height(forWidth);
        return themeNode.adjust_preferred_height(minHeight * this.child.scale_y,
                                                 natHeight * this.child.scale_y);
    },

    vfunc_get_preferred_width: function(forHeight) {
        let themeNode = this.get_theme_node();

        if (this.child == null)
            return [0, 0];

        forHeight = themeNode.adjust_for_height(forHeight);
        let [minWidth, natWidth] = this.child.get_preferred_width(forHeight);
        return themeNode.adjust_preferred_width(minWidth * this.child.scale_y,
                                                natWidth * this.child.scale_y);
    },

    showLabel: function() {
        if (!this._labelText)
            return;

        this.label.set_text(this._labelText);
        this.label.opacity = 0;
        this.label.show();

        let [stageX, stageY] = this.get_transformed_position();

        let itemHeight = this.allocation.y2 - this.allocation.y1;

        let labelHeight = this.label.get_height();
        let yOffset = Math.floor((itemHeight - labelHeight) / 2)

        let y = stageY + yOffset;

        let node = this.label.get_theme_node();
        let xOffset = node.get_length('-x-offset');

        let x;
        if (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL)
            x = stageX - this.label.get_width() - xOffset;
        else
            x = stageX + this.get_width() + xOffset;

        this.label.set_position(x, y);
        Tweener.addTween(this.label,
                         { opacity: 255,
                           time: DASH_ITEM_LABEL_SHOW_TIME,
                           transition: 'easeOutQuad',
                         });
    },

    setLabelText: function(text) {
        this._labelText = text;
        this.child.accessible_name = text;
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
    },

    setChild: function(actor) {
        if (this.child == actor)
            return;

        this.destroy_all_children();

        this.child = actor;
        this.add_actor(this.child);

        this.child.set_scale_with_gravity(this._childScale, this._childScale,
                                          Clutter.Gravity.CENTER);
        this.child.set_opacity(this._childOpacity);
    },

    show: function(animate) {
        if (this.child == null)
            return;

        let time = animate ? DASH_ANIMATION_TIME : 0;
        Tweener.addTween(this,
                         { childScale: 1.0,
                           childOpacity: 255,
                           time: time,
                           transition: 'easeOutQuad'
                         });
    },

    destroy: function() {
        if (this.label)
            this.label.destroy();

        this.parent();
    },

    animateOutAndDestroy: function() {
        if (this.label)
            this.label.destroy();

        if (this.child == null) {
            this.destroy();
            return;
        }

        this.animatingOut = true;
        Tweener.addTween(this,
                         { childScale: 0.0,
                           childOpacity: 0,
                           time: DASH_ANIMATION_TIME,
                           transition: 'easeOutQuad',
                           onComplete: Lang.bind(this, function() {
                               this.destroy();
                           })
                         });
    },

    set childScale(scale) {
        this._childScale = scale;

        if (this.child == null)
            return;

        this.child.set_scale_with_gravity(scale, scale,
                                          Clutter.Gravity.CENTER);
        this.queue_relayout();
    },

    get childScale() {
        return this._childScale;
    },

    set childOpacity(opacity) {
        this._childOpacity = opacity;

        if (this.child == null)
            return;

        this.child.set_opacity(opacity);
        this.queue_redraw();
    },

    get childOpacity() {
        return this._childOpacity;
    }
});

const myDragPlaceholderItem = new Lang.Class({
    Name: 'myDragPlaceholderItem',
    Extends: myDashItemContainer,

    _init: function() {
        this.parent();
        this.setChild(new St.Bin({ style_class: 'placeholder' }));
    }
});

const myEmptyDropTargetItem = new Lang.Class({
    Name: 'myEmptyDropTargetItem',
    Extends: myDashItemContainer,

    _init: function() {
        this.parent();
        this.setChild(new St.Bin({ style_class: 'empty-dash-drop-target' }));
    }
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
        this.iconSize = this._settings.get_int('dash-max-icon-size');
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

		this._appsContainer;
		
		this._scrollView = new St.ScrollView({ reactive: true });
        if (!dock_horizontal) {
			this._scrollView.hscrollbar_policy = Gtk.PolicyType.NEVER;
			this._scrollView.vscroll.hide();
			this._appsContainer = new St.BoxLayout({ vertical: true, clip_to_allocation: false });
		} else {
			this._scrollView.vscrollbar_policy = Gtk.PolicyType.NEVER;
			this._scrollView.hscroll.hide();
			this._appsContainer = new St.BoxLayout({ vertical: false, clip_to_allocation: true });
		}

		this._scrollView.add_actor(this._box);
		this._scrollView.connect('scroll-event', Lang.bind(this, this._onScrollEvent ));
		this._appsContainer.add_actor(this._scrollView);

		// Init Show Apps applet	
		this.showAppsButton = new St.Button({ toggle_mode: true });
		this._showAppsIcon = null;
		
		// Init applets
		this._linkTray = null;
		this._showDesktop = null;
		this._recyclingBin = null;

		// Init applets direction
		if (!dock_horizontal)
			Widgets.dock_horizontal = false;
		else
			Widgets.dock_horizontal = true;
						
		this.make_dock();

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

    make_dock: function() {
		try {
			let position = this._settings.get_string('applets-order');
			for (let i = 0; i < 5;i++) {
				let pos = parseInt(position[i]);
				switch (pos) {
					case 1:
						if (this._settings.get_boolean('applet-show-apps-visible')) {
							this._showAppsIcon = new Widgets.myShowAppsIcon(this.iconSize, this._settings);
							this._showAppsIcon.icon.setIconSize(this.iconSize);
							this._hookUpLabelForApplets(this._showAppsIcon);
							this.showAppsButton = this._showAppsIcon.actor;						
							this._container.add_actor(this._showAppsIcon.actor);
						}
						break;
					case 2:
						//if (this._settings.get_boolean('applet-favourite-apps-visible'))			
						this._container.add_actor(this._appsContainer);						
						break;
					case 3:
						if (this._settings.get_boolean('applet-links-tray-visible')) {
							this._linksBox = new Widgets.myLinkBox(this.iconSize, 
								this._settings, this);
														
							this._container.add_actor(this._linksBox);
						}
						break;
					case 4:
						if (this._settings.get_boolean('applet-show-desktop-visible')) {
							this._showDesktop = new Widgets.myShowDesktop(this.iconSize, this._settings);
							this._showDesktop.icon.setIconSize(this.iconSize);
							this._hookUpLabelForApplets(this._showDesktop);					
							this._container.add_actor(this._showDesktop.actor);
						}
						break;
					case 5:
						if (this._settings.get_boolean('applet-recycling-bin-visible')) {
							this._recyclingBin = new Widgets.myRecyclingBin(this.iconSize, this._settings);
							this._recyclingBin.icon.setIconSize(this.iconSize);	
							this._hookUpLabelForApplets(this._recyclingBin);
							this._container.add_actor(this._recyclingBin.actor);
						}
						break;												
					default:
						break;
				}
			}
		} catch (e) {
			log("Error in adding applets: "+e.message);
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
        
    _onDragBegin: function() {	
        this._dragCancelled = false;
        this._dragMonitor = {
            dragMotion: Lang.bind(this, this._onDragMotion)
        };
        DND.addDragMonitor(this._dragMonitor);

        if (this._box.get_n_children() == 0) {
            this._emptyDropTarget = new myEmptyDropTargetItem();
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
        let app = getAppFromSource(dragEvent.source);    
        if (app == null)
            return DND.DragMotionResult.CONTINUE;

        if (!this._box.contains(dragEvent.targetActor))
            this._clearDragPlaceholder();

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

    _hookUpLabelForApplets: function(item) {	
        item.actor.connect('notify::hover', Lang.bind(this, function() {
            this._syncLabelForApplets(item);
        }));

        Main.overview.connect('hiding', Lang.bind(this, function() {
            this._labelShowing = false;
            item.hideLabel();
        }));
    },

    _createAppItem: function(app) {
		let appIcon = new Widgets.myAppIcon(this._settings, app, 
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

		let item = new myDashItemContainer();
		
		switch(this._settings.get_int('dock-placement')) {
				case 0:
					break;	
				case 1:
					break;
				case 2:
					break;
				case 3:
					item.showLabel = showHoverLabelTop;
					break;	
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

    _syncLabelForApplets: function (item) {
		let shouldShow = item.actor.get_hover();
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
				x2: this.iconSize, y2: this.iconSize });
		} else {
			maxAllocation = new Clutter.ActorBox({ x1: 0, y1: 0,
				x2: this.iconSize, y2: this.iconSize});
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
        if (scaleFactor != 1)
			this.iconSize = this.iconSize * scaleFactor;

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
    },

    setMaxIconSize: function(size) {
		this._availableIconSize = size;

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

    handleDragOver: function(source, actor, x, y, time) {
        // Don't allow to add favourites if they are not displayed
        if( !this._settings.get_boolean('show-favorites') )
            return DND.DragMotionResult.NO_DROP;

        let app = getAppFromSource(source);

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

            this._dragPlaceholder = new myDragPlaceholderItem();
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

    acceptDrop: function(source, actor, x, y, time) {
        // Don't allow to add favourites if they are not displayed
        if( !this._settings.get_boolean('show-favorites') )
            return true;

        let app = getAppFromSource(source);

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
