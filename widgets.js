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

let dock_horizontal = true;

const myHeapTray = new Lang.Class({
    Name: 'myHeapTray',
                    
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

		//this.actor.connect('clicked', Lang.bind(this, this.pop_up_menu));
		
		this.actor.connect('clicked', Lang.bind(this, this.popupMenu));
		
		//this.icon = new St.Icon({ icon_name: 'go-down-symbolic', icon_size: this.iconSize });
		this._iconActor = null;
        this.icon = new IconGrid.BaseIcon(_("Show Applications"),
                                           { setSizeManually: true,
                                             showLabel: false,
                                             createIcon: Lang.bind(this, this._createIcon) });
		this.actor.set_child(this.icon.actor);

this.entry = new St.Entry();
this.entry.set_width(100);
//this.actor.set_child(this.entry);
this.entry.set_text("00000000");
this.dia = false;

//this.modal_dialog = new Modality();
//this.modal_dialog.open();

//this.modal_dialog = new ModalDialogNEW();
//this.modal_dialog.open();


		let dontCreateMenu = false;//IF no icons? label _("Tray is Empty")

		this.menuManager = new PopupMenu.PopupMenuManager(this);

		if (dontCreateMenu) {
            this.menu = new PopupMenu.PopupDummyMenu(this.btnFolderIcon);
        } else {
			this.menu = new myHeapTrayMenu(this, iconSize);
           
            this.menu.actor.hide();    
        }
        
		this.menuManager.addMenu(this.menu); 


//------------------------------------------------------------------
let path = '/home/pc/.local/share/gnome-shell/extensions/dash-to-dock@micxgx.gmail.com/new.js1';
		/*if ( GLib.file_test(path, GLib.FileTest.EXISTS) ) {
			log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
			//return Gio.File.new_for_path(paths[i]);
		} else {
			log("WRITES? ");
			Gio.File.new_for_path(path);
		}*/



//var input_file = Gio.file_new_for_path(path);
//var fstream = input_file.read();
//var dstream = new Gio.DataInputStream.c_new(fstream);
//var line = dstream.read_until(“”, 0);
//fstream.close();
//log(line);

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
	},

    destroy: function() {
        this.actor._delegate = null;

        if (this.menu)
            this.menu.destroy();
            
        this.actor.destroy();
        this.emit('destroy');
    },

    _createIcon: function(size) {
        this._iconActor = new St.Icon({ icon_name: 'go-down-symbolic',
                                        icon_size: size,
                                        style_class: 'show-apps-icon',
                                        track_hover: true });
        return this._iconActor;
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
//log(111);
//log('>>>>>>>>>> '+source+'   '+actor+'  x? '+(source == Main.xdndHandler));

if (source == Main.xdndHandler) {
//log(actor);


//---------DIALOG BLOCK
if (this.dia) {
log('LAUNCHING DIALOG');
	this.modal_dialog = new Modality();
	this.modal_dialog.open();
	this.dia = false;
}
//---------------------



let pickedActor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);

//log(x+' act '+actor.x+'  '+y+' act  '+actor.y);
//log(global.stage.get_children () );

//log( time	+ source +'  '+pickedActor + '   ' + pickedActor.get_parent() );


//this.entry.set_text( source );

//let windows = global.get_window_actors();


//log(pickedActor);
//log(pickedActor.get_parent());

//let item = new PopupMenu.PopupMenuItem( "TEST" );
//item.actor.add_child(actor);
//this.menu.addMenuItem(item);
}




//        if (!this._canRemoveApp(getAppFromSource(source)))
//            return DND.DragMotionResult.NO_DROP;

        return DND.DragMotionResult.MOVE_DROP;//?? .CONTINUE OR .DROP?
    },

    acceptDrop: function(source, actor, x, y, time) {
log(1);
log('>>>>>>>>>> '+source+'   '+actor);
        //let app = getAppFromSource(source);
log(2);

//        if (!this._canRemoveApp(app))
//            return false;
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

Signals.addSignalMethods(myHeapTray.prototype);

// This class is a extension of the upstream AppIcon class (ui.appDisplay.js).
const myHeapTrayMenu = new Lang.Class({
    Name: 'myHeapTrayMenu',
    Extends: AppDisplay.PopupMenu.PopupMenu,

    _init: function(source, iconSize) {
		this.iconSize = iconSize;
        let side = St.Side.TOP;
        this.parent(source.actor, 0.5, side);//Menu-Arrow-Side

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
		let favs = AppFavorites.getAppFavorites().getFavorites();
		for(let i = 0; i < favs.length ;i++) {
			this._appendMenuItem( favs[i] ); 
		}		
	},
	
    _redisplay: function() {
/*		
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
            let item = this._appendMenuItem(window.title);
            item.connect('activate', Lang.bind(this, function() {
                this.emit('activate-window', window);
            }));
        }

            this._newWindowMenuItem = this._appendMenuItem(_("New Window"));
            this._newWindowMenuItem.connect('activate', Lang.bind(this, function() {
                this._source.app.open_new_window(-1);
                this.emit('activate-window', null);
            }));

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
*/            
    },
    
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

Signals.addSignalMethods(myHeapTrayMenu.prototype);


















const Modality = new Lang.Class({
    Name: 'Modality',
    Extends: ModalDialog.ModalDialog,

    _init: function() {
        this.parent({ destroyOnClose: false });
        this._dialogLayout = 
            typeof this.dialogLayout === "undefined"
            ? this._dialogLayout
            : this.dialogLayout;

        this._dialogLayout.set_style_class_name(null);
        this.contentLayout.set_style_class_name('search-dialog');
        
        this._create_dialog();

        this.activate_window = false;
    },
    
    _create_dialog: function() {
        this.search_entry = new St.Entry({
            style_class: 'search-entry'
        });
        this.search_entry.connect(
            'key-press-event',
            Lang.bind(this, this._on_key_press)
        );
        this.search_entry.get_clutter_text().connect(
            'activate',
            Lang.bind(this, this._on_text_activate)
        );
        this.search_entry.get_clutter_text().connect(
            'text-changed', 
            Lang.bind(this, this._on_search_text_changed)
        );
		this.contentLayout.add(this.search_entry);
    },

    _on_key_press: function(o, e) {
        let symbol = e.get_key_symbol();
        
        if(symbol == Clutter.Escape)
            this.close();
        
        if(symbol == Clutter.Return) {
			log('Entered Something');
            this.close();
        }
        
        return true;
    },

    _on_text_activate: function(text) {
        text = text.get_text();
    },

    _on_search_text_changed: function() {
        let text = this.search_entry.get_text();
        return true;
    },

    open: function() {
        this.parent();
        this.search_entry.grab_key_focus();
    },

    close: function() {
        this.search_entry.set_text('');
        this.parent();
    }
});



//===================================================================================================





const Gdk = imports.gi.Gdk;
const Pango = imports.gi.Pango;
const Atk = imports.gi.Atk;
const Params = imports.misc.params;
const Animation = imports.ui.animation;
const Layout = imports.ui.layout;
const Lightbox = imports.ui.lightbox;

const OPEN_AND_CLOSE_TIME = 0.1;
const FADE_OUT_DIALOG_TIME = 1.0;

const WORK_SPINNER_ICON_SIZE = 24;
const WORK_SPINNER_ANIMATION_DELAY = 1.0;
const WORK_SPINNER_ANIMATION_TIME = 0.3;

const State = {
    OPENED: 0,
    CLOSED: 1,
    OPENING: 2,
    CLOSING: 3,
    FADED_OUT: 4
};

const ModalDialogNEW = new Lang.Class({
    Name: 'ModalDialogNEW',

    _init: function(params) {
        params = Params.parse(params, { shellReactive: false,
                                        styleClass: null,
                                        keybindingMode: Shell.KeyBindingMode.SYSTEM_MODAL,
                                        shouldFadeIn: true,
                                        destroyOnClose: true });

        this.state = State.CLOSED;
        this._hasModal = false;
        this._keybindingMode = params.keybindingMode;
        this._shellReactive = params.shellReactive;
        this._shouldFadeIn = params.shouldFadeIn;
        this._destroyOnClose = params.destroyOnClose;

        this._group = new St.Widget({ visible: false,
                                      x: 0,
                                      y: 0,
                                      accessible_role: Atk.Role.DIALOG });
        Main.layoutManager.modalDialogGroup.add_actor(this._group);

        let constraint = new Clutter.BindConstraint({ source: global.stage,
                                                      coordinate: Clutter.BindCoordinate.ALL });
        this._group.add_constraint(constraint);

        this._group.connect('destroy', Lang.bind(this, this._onGroupDestroy));

        this._pressedKey = null;
        this._buttonKeys = {};
        this._group.connect('key-press-event', Lang.bind(this, this._onKeyPressEvent));
        this._group.connect('key-release-event', Lang.bind(this, this._onKeyReleaseEvent));

        this.backgroundStack = new St.Widget({ layout_manager: new Clutter.BinLayout() });
        this._backgroundBin = new St.Bin({ child: this.backgroundStack,
                                           x_fill: true, y_fill: true });
        this._monitorConstraint = new Layout.MonitorConstraint();
        this._backgroundBin.add_constraint(this._monitorConstraint);
        this._group.add_actor(this._backgroundBin);

        this.dialogLayout = new St.BoxLayout({ style_class: 'modal-dialog',
                                               vertical:    true });
        // modal dialogs are fixed width and grow vertically; set the request
        // mode accordingly so wrapped labels are handled correctly during
        // size requests.
        this.dialogLayout.request_mode = Clutter.RequestMode.HEIGHT_FOR_WIDTH;

        if (params.styleClass != null)
            this.dialogLayout.add_style_class_name(params.styleClass);

        if (!this._shellReactive) {
            this._lightbox = new Lightbox.Lightbox(this._group,
                                                   { inhibitEvents: true,
                                                     radialEffect: true });
            this._lightbox.highlight(this._backgroundBin);

            this._eventBlocker = new Clutter.Actor({ reactive: true });
            this.backgroundStack.add_actor(this._eventBlocker);
        }
        this.backgroundStack.add_actor(this.dialogLayout);


        this.contentLayout = new St.BoxLayout({ vertical: true });
        this.dialogLayout.add(this.contentLayout,
                              { expand:  true,
                                x_fill:  true,
                                y_fill:  true,
                                x_align: St.Align.MIDDLE,
                                y_align: St.Align.START });

        this.buttonLayout = new St.BoxLayout({ style_class: 'modal-dialog-button-box',
                                               vertical: false });
        this.dialogLayout.add(this.buttonLayout,
                              { x_align: St.Align.MIDDLE,
                                y_align: St.Align.END });

        global.focus_manager.add_group(this.dialogLayout);
        this._initialKeyFocus = this.dialogLayout;
        this._initialKeyFocusDestroyId = 0;
        this._savedKeyFocus = null;

        this._workSpinner = null;
    },

    destroy: function() {
        this._group.destroy();
    },

    clearButtons: function() {
        this.buttonLayout.destroy_all_children();
        this._buttonKeys = {};
    },

    setButtons: function(buttons) {
        this.clearButtons();

        for (let i = 0; i < buttons.length; i++) {
            let buttonInfo = buttons[i];

            let x_alignment;
            if (buttons.length == 1)
                x_alignment = St.Align.END;
            else if (i == 0)
                x_alignment = St.Align.START;
            else if (i == buttons.length - 1)
                x_alignment = St.Align.END;
            else
                x_alignment = St.Align.MIDDLE;

            this.addButton(buttonInfo, { expand: true,
                                         x_fill: false,
                                         y_fill: false,
                                         x_align: x_alignment,
                                         y_align: St.Align.MIDDLE });
        }
    },

    addButton: function(buttonInfo, layoutInfo) {
        let label = buttonInfo['label'];
        let action = buttonInfo['action'];
        let key = buttonInfo['key'];
        let isDefault = buttonInfo['default'];

        let keys;

        if (key)
            keys = [key];
        else if (isDefault)
            keys = [Clutter.KEY_Return, Clutter.KEY_KP_Enter, Clutter.KEY_ISO_Enter];
        else
            keys = [];

        let button = new St.Button({ style_class: 'modal-dialog-button',
                                     button_mask: St.ButtonMask.ONE | St.ButtonMask.THREE,
                                     reactive:    true,
                                     can_focus:   true,
                                     label:       label });
        button.connect('clicked', action);

        buttonInfo['button'] = button;

        if (isDefault)
            button.add_style_pseudo_class('default');

        if (!this._initialKeyFocusDestroyId)
            this._initialKeyFocus = button;

        for (let i in keys)
            this._buttonKeys[keys[i]] = buttonInfo;

        this.buttonLayout.add(button, layoutInfo);

        return button;
    },

    placeSpinner: function(layoutInfo) {
        let spinnerIcon = global.datadir + '/theme/process-working.svg';
        this._workSpinner = new Animation.AnimatedIcon(spinnerIcon, WORK_SPINNER_ICON_SIZE);
        this._workSpinner.actor.opacity = 0;
        this._workSpinner.actor.show();

        this.buttonLayout.add(this._workSpinner.actor, layoutInfo);
    },

    setWorking: function(working) {
        if (!this._workSpinner)
            return;

        Tweener.removeTweens(this._workSpinner.actor);
        if (working) {
            this._workSpinner.play();
            Tweener.addTween(this._workSpinner.actor,
                             { opacity: 255,
                               delay: WORK_SPINNER_ANIMATION_DELAY,
                               time: WORK_SPINNER_ANIMATION_TIME,
                               transition: 'linear'
                             });
        } else {
            Tweener.addTween(this._workSpinner.actor,
                             { opacity: 0,
                               time: WORK_SPINNER_ANIMATION_TIME,
                               transition: 'linear',
                               onCompleteScope: this,
                               onComplete: function() {
                                   if (this._workSpinner)
                                       this._workSpinner.stop();
                               }
                             });
        }
    },

    _onKeyPressEvent: function(object, event) {
        this._pressedKey = event.get_key_symbol();
        return Clutter.EVENT_PROPAGATE;
    },

    _onKeyReleaseEvent: function(object, event) {
        let pressedKey = this._pressedKey;
        this._pressedKey = null;

        let symbol = event.get_key_symbol();
        if (symbol != pressedKey)
            return Clutter.EVENT_PROPAGATE;

        let buttonInfo = this._buttonKeys[symbol];
        if (!buttonInfo)
            return Clutter.EVENT_PROPAGATE;

        let button = buttonInfo['button'];
        let action = buttonInfo['action'];

        if (action && button.reactive) {
            action();
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    },

    _onGroupDestroy: function() {
        this.emit('destroy');
    },

    _fadeOpen: function(onPrimary) {
        if (onPrimary)
            this._monitorConstraint.primary = true;
        else
            this._monitorConstraint.index = global.screen.get_current_monitor();

        this.state = State.OPENING;

        this.dialogLayout.opacity = 255;
        if (this._lightbox)
            this._lightbox.show();
        this._group.opacity = 0;
        this._group.show();
        Tweener.addTween(this._group,
                         { opacity: 255,
                           time: this._shouldFadeIn ? OPEN_AND_CLOSE_TIME : 0,
                           transition: 'easeOutQuad',
                           onComplete: Lang.bind(this,
                               function() {
                                   this.state = State.OPENED;
                                   this.emit('opened');
                               })
                         });
    },

    setInitialKeyFocus: function(actor) {
        if (this._initialKeyFocusDestroyId)
            this._initialKeyFocus.disconnect(this._initialKeyFocusDestroyId);

        this._initialKeyFocus = actor;

        this._initialKeyFocusDestroyId = actor.connect('destroy', Lang.bind(this, function() {
            this._initialKeyFocus = this.dialogLayout;
            this._initialKeyFocusDestroyId = 0;
        }));
    },

    open: function(timestamp, onPrimary) {
        if (this.state == State.OPENED || this.state == State.OPENING)
            return true;

        if (!this.pushModal({ timestamp: timestamp }))
            return false;

        this._fadeOpen(onPrimary);
        return true;
    },

    close: function(timestamp) {
        if (this.state == State.CLOSED || this.state == State.CLOSING)
            return;

        this.state = State.CLOSING;
        this.popModal(timestamp);
        this._savedKeyFocus = null;

        Tweener.addTween(this._group,
                         { opacity: 0,
                           time: OPEN_AND_CLOSE_TIME,
                           transition: 'easeOutQuad',
                           onComplete: Lang.bind(this,
                               function() {
                                   this.state = State.CLOSED;
                                   this._group.hide();
                                   this.emit('closed');

                                   if (this._destroyOnClose)
                                       this.destroy();
                               })
                         });
    },

    // Drop modal status without closing the dialog; this makes the
    // dialog insensitive as well, so it needs to be followed shortly
    // by either a close() or a pushModal()
    popModal: function(timestamp) {
        if (!this._hasModal)
            return;

        let focus = global.stage.key_focus;
        if (focus && this._group.contains(focus))
            this._savedKeyFocus = focus;
        else
            this._savedKeyFocus = null;
        Main.popModal(this._group, timestamp);
        global.gdk_screen.get_display().sync();
        this._hasModal = false;

        if (!this._shellReactive)
            this._eventBlocker.raise_top();
    },

    pushModal: function (timestamp) {
log(111);		
        if (this._hasModal)
            return true;
            
log(222+'   '+(!Main.pushModal(this._group, { timestamp: timestamp,
                                           keybindingMode: this._keybindingMode })));            

//        if (!Main.pushModal(this._group, { timestamp: timestamp,
//                                           keybindingMode: this._keybindingMode }))
//            return false;

log(333);

        this._hasModal = true;
        if (this._savedKeyFocus) {
            this._savedKeyFocus.grab_key_focus();
            this._savedKeyFocus = null;
        } else {
            this._initialKeyFocus.grab_key_focus();
        }

        if (!this._shellReactive)
            this._eventBlocker.lower_bottom();
        return true;
    },

    // This method is like close, but fades the dialog out much slower,
    // and leaves the lightbox in place. Once in the faded out state,
    // the dialog can be brought back by an open call, or the lightbox
    // can be dismissed by a close call.
    //
    // The main point of this method is to give some indication to the user
    // that the dialog reponse has been acknowledged but will take a few
    // moments before being processed.
    // e.g., if a user clicked "Log Out" then the dialog should go away
    // imediately, but the lightbox should remain until the logout is
    // complete.
    _fadeOutDialog: function(timestamp) {
        if (this.state == State.CLOSED || this.state == State.CLOSING)
            return;

        if (this.state == State.FADED_OUT)
            return;

        this.popModal(timestamp);
        Tweener.addTween(this.dialogLayout,
                         { opacity: 0,
                           time:    FADE_OUT_DIALOG_TIME,
                           transition: 'easeOutQuad',
                           onComplete: Lang.bind(this,
                               function() {
                                   this.state = State.FADED_OUT;
                               })
                         });
    }
});
Signals.addSignalMethods(ModalDialogNEW.prototype);
