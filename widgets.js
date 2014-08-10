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

// A container like StBin, but taking the child's scale into account
// when requesting a size
const DashItemContainerNEW = new Lang.Class({
    Name: 'DashItemContainerNEW',
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

const ShowAppsIconNEW = new Lang.Class({
    Name: 'ShowAppsIconNEW',
    Extends: DashItemContainerNEW,

    _init: function() {
        this.parent();

        this.toggleButton = new St.Button({ style_class: 'show-apps',
                                            track_hover: true,
                                            can_focus: true,
                                            toggle_mode: true });
        this._iconActor = null;
        this.icon = new IconGrid.BaseIcon(_("Show Applications"),
                                           { setSizeManually: true,
                                             showLabel: false,
                                             createIcon: Lang.bind(this, this._createIcon) });
        this.toggleButton.add_actor(this.icon.actor);
        this.toggleButton._delegate = this;

        this.setChild(this.toggleButton);
        this.setDragApp(null);
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
