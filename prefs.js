// -*- mode: js2; indent-tabs-mode: nil; js2-basic-offset: 4 -*-

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Gettext = imports.gettext.domain('dashtodock');
const _ = Gettext.gettext;
const N_ = function(e) { return e };

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const WorkspaceSettingsWidget = new GObject.Class({// FIXME: Why call it this funny name?
    Name: 'WorkspaceIndicator.WorkspaceSettingsWidget',
    GTypeName: 'WorkspaceSettingsWidget',
    Extends: Gtk.Box,

    _init: function(params) {
		this.parent(params);
		this.settings = Convenience.getSettings('org.gnome.shell.extensions.dash-to-dock');

		let notebook = new Gtk.Notebook();

		/* MAIN PAGE */

		let dockSettings = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL});
		let dockSettingsTitle = new Gtk.Label({label: _("Main")});

		let dockSettingsMainPage = new Gtk.Box({orientation:Gtk.Orientation.HORIZONTAL, 
			homogeneous:true, spacing:30, margin:10});
		indentWidget(dockSettingsMainPage);

		/* DOCK PLACEMENT */

		let dockPlacement = new Gtk.Box({margin_top:10, margin_right:10, margin_bottom:0, margin_left:10});
		
		let dockPlacementLabel = new Gtk.Label({label: _("Dock is placed in the display's"), hexpand:true, xalign:0});

		let dockPositionRadioGrid = new Gtk.Grid();
 
		let dockPosition1 = new Gtk.RadioButton ({label:  _("LEFT"), halign: Gtk.Align.START  });
		dockPosition1.connect('toggled', Lang.bind(this, function(widget) {
			if (widget.active)
				this.settings.set_int('dock-placement', 0);
		}));
		dockPositionRadioGrid.attach(dockPosition1, 0, 1, 1, 1);
		let dockPosition2 = new Gtk.RadioButton ({group: dockPosition1, label:  _("RIGHT"), halign: Gtk.Align.START  });
		dockPosition2.connect('toggled', Lang.bind(this, function(widget) {
			if (widget.active)
				this.settings.set_int('dock-placement', 1);
		}));
		dockPositionRadioGrid.attach(dockPosition2, 1, 1, 1, 1);
        let dockPosition3 = new Gtk.RadioButton ({group: dockPosition1, label:  _("TOP"), halign: Gtk.Align.START  });
		dockPosition3.connect('toggled', Lang.bind(this, function(widget) {
			if (widget.active)
				this.settings.set_int('dock-placement', 2);
		}));
        dockPositionRadioGrid.attach(dockPosition3, 2, 1, 1, 1);
		let dockPosition4 = new Gtk.RadioButton ({group: dockPosition1, label:  _("BOTTOM"), halign: Gtk.Align.START });
		dockPosition4.connect('toggled', Lang.bind(this, function(widget) {
			if (widget.active)
				this.settings.set_int('dock-placement', 3);
		}));
		dockPositionRadioGrid.attach(dockPosition4, 3, 1, 1, 1);
		
		switch (this.settings.get_int('dock-placement')) {
			case 0:
				dockPosition1.set_active (1);			
				break;
			case 1:
				dockPosition2.set_active (1);			
				break;
			case 2:
				dockPosition3.set_active (1);			
				break;
			case 3:
				dockPosition4.set_active (1);			
				break;
			default:
				dockPosition4.set_active (1);			
				break;											
		}

		dockPlacement.add(dockPlacementLabel);	
		dockPlacement.add(dockPositionRadioGrid);

		/* DOCK FIXED */
		
		let dockFixed = new Gtk.Box({spacing:30, margin_top:10, margin_right:10, margin_left:10});
		let alwaysVisibleLabel = new Gtk.Label({label: _("Dock is fixed and always visible"),
			use_markup: true, xalign: 0, hexpand:true});

		let alwaysVisible =  new Gtk.Switch({halign:Gtk.Align.END});
			alwaysVisible.set_active(this.settings.get_boolean('dock-fixed'));
			alwaysVisible.connect('notify::active', Lang.bind(this, function(check){
				this.settings.set_boolean('dock-fixed', check.get_active());
			}));
	   
		dockFixed.add(alwaysVisibleLabel);
		dockFixed.add(alwaysVisible);

		/* DOCK PREFERRED MONITOR */

		let dockPreferredMonitor = new Gtk.Box({margin_top:10, margin_right:10, margin_bottom:0, margin_left:10});
			let dockPreferredMonitorLabel = new Gtk.Label({label: _("Dock is shown on this (attached) monitor"), hexpand:true, xalign:0});
			let dockPreferredMonitorCombo = new Gtk.ComboBoxText({halign:Gtk.Align.END});
				dockPreferredMonitorCombo.append_text(_("Default"));
				dockPreferredMonitorCombo.append_text(_("1"));
				dockPreferredMonitorCombo.append_text(_("2"));
				dockPreferredMonitorCombo.append_text(_("3"));
				dockPreferredMonitorCombo.append_text(_("4"));
				let active = this.settings.get_int('preferred-monitor');
				if (active<0)
					active = 0;
					
				dockPreferredMonitorCombo.set_active(active);
				dockPreferredMonitorCombo.connect('changed', Lang.bind (this, function(widget) {
					let active = widget.get_active();
					if (active <=0)
						this.settings.set_int('preferred-monitor', -1);
					else
						this.settings.set_int('preferred-monitor', active );
				}));

		dockPreferredMonitor.add(dockPreferredMonitorLabel);
		dockPreferredMonitor.add(dockPreferredMonitorCombo);

		/* ICON SIZE */

		let dockIconSize = new Gtk.Box({orientation:Gtk.Orientation.HORIZONTAL, homogeneous:true, hexpand:true,
			margin_top:10, margin_right:10, margin_left:10});

		let allSizes  = [ 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64 ];

		let IconSizeLabel = new Gtk.Label({label: _("Dock icon size"), use_markup: true,
			xalign: 0, valign: Gtk.Align.END, margin_bottom:0, margin_left:0});
		let IconSize = new Gtk.SpinButton({halign:Gtk.Align.END});
				IconSize.set_sensitive(true);
				IconSize.set_range(16, 64);
				IconSize.set_value(this.settings.get_int('dash-max-icon-size'));
				IconSize.set_increments(1, 2); 
				IconSize.connect('value-changed', Lang.bind(this, function(button){
					let s = button.get_value_as_int();
					this.settings.set_int('dash-max-icon-size', s);
				}));

		dockIconSize.add(IconSizeLabel);
		dockIconSize.add(IconSize);

		/* DOCK SIZE */

		let dockDimensions = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL, homogeneous:false,
			margin_top:10, margin_right:10, margin_bottom:0, margin_left:10});
			
		let dockDimensionsLabel = new Gtk.Label({label: _("Dock size limits"), hexpand: true, halign: Gtk.Align.START});

		dockDimensions.add(dockDimensionsLabel);

		let dockDimensionsInternal = new Gtk.Box({orientation:Gtk.Orientation.HORIZONTAL, homogeneous:false,
			margin_top:10, margin_right:10, margin_bottom:10, margin_left:10});					
		indentWidget(dockDimensionsInternal);

		let extendSize =  new Gtk.CheckButton({label: _("Expand all the way"), hexpand:true});
			extendSize.set_active(this.settings.get_boolean('extend-size'));
			extendSize.connect('toggled', Lang.bind(this, function(check){
				this.settings.set_boolean('extend-size', check.get_active());
			}));    

		dockDimensionsInternal.add(extendSize);
		
		let dockMaxSizeTimeout=0; // Used to avoid to continuosly update the dock height
		let dockMaxSizeLabel = new Gtk.Label({label: _("Max height/width"), xalign: 0, halign:Gtk.Align.END, margin_right:30});
		let dockMaxSize =  new Gtk.Scale({orientation: Gtk.Orientation.HORIZONTAL, valuePos: Gtk.PositionType.RIGHT});
			dockMaxSize.set_range(0, 100);
			dockMaxSize.set_value(this.settings.get_double('size-fraction')*100);
			dockMaxSize.set_digits(0);
			dockMaxSize.set_increments(5,5);
			dockMaxSize.set_size_request(200, -1);
			dockMaxSize.connect('value-changed', Lang.bind(this, function(button){
				let s = button.get_value()/100;
				if(dockMaxSizeTimeout>0)
					Mainloop.source_remove(dockMaxSizeTimeout);
				dockMaxSizeTimeout = Mainloop.timeout_add(250, Lang.bind(this, function(){
					this.settings.set_double('size-fraction', s);
					return false;
				}));
			}));

			dockMaxSize.connect('format-value', function(scale, value) {return value + '%'});


		dockDimensionsInternal.add(dockMaxSizeLabel);
		dockDimensionsInternal.add(dockMaxSize);
		dockDimensions.add(dockDimensionsInternal);

		this.settings.bind('extend-size', dockMaxSizeLabel, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);
		this.settings.bind('extend-size', dockMaxSize, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);

		/* DOCK INTELLIHIDE */

		let dockIntellihidePanel = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL, homogeneous:true});

		let dockIntellihideSwitchPanel = new Gtk.Box({margin_top:10, margin_right:10, margin_bottom:0, margin_left:10});

		let intellihideLabel = new Gtk.Label({label: _("Intellihide"),  xalign: 0, hexpand:true, margin_right:10});
		let intellihide =  new Gtk.Switch({halign:Gtk.Align.END});
			intellihide.set_active(this.settings.get_boolean('intellihide'));
			intellihide.connect('notify::active', Lang.bind(this, function(check){
				this.settings.set_boolean('intellihide', check.get_active());
			}));

		dockIntellihideSwitchPanel.add(intellihideLabel);
		dockIntellihideSwitchPanel.add(intellihide);
		dockIntellihidePanel.add(dockIntellihideSwitchPanel);
		
		let dockIntellihide = new Gtk.Box({margin_top:10, margin_right:10, margin_bottom:0, margin_left:10});
		indentWidget(dockIntellihide);
		
		let perAppIntellihide =  new Gtk.CheckButton({label: _("Application based intellihide"), hexpand:true});
			perAppIntellihide.set_active(this.settings.get_boolean('intellihide-perapp'));
			perAppIntellihide.connect('toggled', Lang.bind(this, function(check){
				this.settings.set_boolean('intellihide-perapp', check.get_active());
			}));

		dockIntellihide.add(perAppIntellihide);
		dockIntellihidePanel.add(dockIntellihide);	

		/* DOCK AUTOHIDE */

		let dockAutohidePanel = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL, homogeneous:true});

		let dockAutohideSwitchPanel = new Gtk.Box({margin_top:10, margin_right:10, margin_bottom:0, margin_left:10});

		let autohideLabel = new Gtk.Label({label: _("Autohide"), xalign: 0, hexpand:true});
		let autohide =  new Gtk.Switch({halign:Gtk.Align.END});
			autohide.set_active(this.settings.get_boolean('autohide'));
			autohide.connect('notify::active', Lang.bind(this, function(check){
				this.settings.set_boolean('autohide', check.get_active());
			}));

		dockAutohideSwitchPanel.add(autohideLabel);
		dockAutohideSwitchPanel.add(autohide);
		dockAutohidePanel.add(dockAutohideSwitchPanel);
		
		/* TIMINGS */

		let dockTimingsGrid= new Gtk.Grid({row_homogeneous:true,column_homogeneous:false, halign:Gtk.Align.END});

		let animationTimeLabel = new Gtk.Label({label: _("Animation time [ms]"), use_markup: true, xalign: 0,hexpand:false, halign:Gtk.Align.END});
		let animationTime = new Gtk.SpinButton({halign:Gtk.Align.END, margin_left:10});
				animationTime.set_sensitive(true);
				animationTime.set_range(0, 5000);
				animationTime.set_value(this.settings.get_double('animation-time')*1000);
				animationTime.set_increments(50, 100);
				animationTime.connect('value-changed', Lang.bind(this, function(button){
					let s = button.get_value_as_int()/1000;
					this.settings.set_double('animation-time', s);
				}));

		let showDelayLabel = new Gtk.Label({label: _("Show delay [ms]"), use_markup: true, xalign: 0, hexpand:false, halign:Gtk.Align.END});
		let showDelay = new Gtk.SpinButton({halign:Gtk.Align.END, margin_left:10});
				showDelay.set_sensitive(true);
				showDelay.set_range(0, 5000);
				showDelay.set_value(this.settings.get_double('show-delay')*1000);
				showDelay.set_increments(50, 100);
				showDelay.connect('value-changed', Lang.bind(this, function(button){
					let s = button.get_value_as_int()/1000;
					this.settings.set_double('show-delay', s);
				}));

		let hideDelayLabel = new Gtk.Label({label: _("Hide delay [ms]"), use_markup: true, xalign: 0, hexpand:false, halign:Gtk.Align.END});
		let hideDelay = new Gtk.SpinButton({halign:Gtk.Align.END, margin_left:10});
				hideDelay.set_sensitive(true);
				hideDelay.set_range(0, 5000);
				hideDelay.set_value(this.settings.get_double('hide-delay')*1000);
				hideDelay.set_increments(50, 100); 
				hideDelay.connect('value-changed', Lang.bind(this, function(button){
					let s = button.get_value_as_int()/1000;
					this.settings.set_double('hide-delay', s);
				}));

		dockTimingsGrid.attach(animationTimeLabel, 0,0,1,1);
		dockTimingsGrid.attach(animationTime, 1,0,1,1);
		dockTimingsGrid.attach(showDelayLabel, 0,1,1,1);
		dockTimingsGrid.attach(showDelay, 1,1,1,1);
		dockTimingsGrid.attach(hideDelayLabel, 0,2,1,1);
		dockTimingsGrid.attach(hideDelay, 1,2,1,1);

		dockSettingsMainPage.add(dockTimingsGrid);

		this.settings.bind('dock-fixed', dockSettingsMainPage, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);

		/* REVEAL PRESSURE */

		let dockPressureControl = new Gtk.Box({orientation:Gtk.Orientation.HORIZONTAL, hexpand:false});
		let dockPressureContainer = new Gtk.Box({halign:Gtk.Align.END, hexpand:true, 
			margin_top:0, margin_right:10, margin_bottom:10, margin_left:0});
		indentWidget(dockPressureControl);


		let requirePressureButton = new Gtk.CheckButton({
			label: _("Require pressure to show the dock"),
			margin_top: 0,
			margin_left: 0
			
		});
		requirePressureButton.set_active(this.settings.get_boolean('require-pressure-to-show'));
		requirePressureButton.connect('toggled', Lang.bind(this, function(check) {
			this.settings.set_boolean('require-pressure-to-show', check.get_active());
		}));

		let pressureThresholdLabel = new Gtk.Label({
			label: _("Minimum pressure [px]"),
			halign:Gtk.Align.END,
			use_markup: true,
			xalign: 0,
			margin_top: 0,
			hexpand: false
		});

		let pressureThresholdSpinner = new Gtk.SpinButton({
			halign: Gtk.Align.END,
			margin_top: 0,
			margin_left: 10
		});
		pressureThresholdSpinner.set_sensitive(true);
		pressureThresholdSpinner.set_range(10, 500);
		pressureThresholdSpinner.set_value(this.settings.get_double("pressure-threshold") * 1);
		pressureThresholdSpinner.set_increments(10, 20);
		pressureThresholdSpinner.connect("value-changed", Lang.bind(this, function(button) {
			let s = button.get_value_as_int() / 1;
			this.settings.set_double("pressure-threshold", s);
		}));

		dockPressureControl.add(requirePressureButton);
		dockPressureContainer.add(pressureThresholdLabel);
		dockPressureContainer.add(pressureThresholdSpinner);
		dockPressureControl.add(dockPressureContainer);

		this.settings.bind('require-pressure-to-show', pressureThresholdLabel, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
		this.settings.bind('require-pressure-to-show', pressureThresholdSpinner, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

		this.settings.bind('dock-fixed', dockIntellihide, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);
		this.settings.bind('dock-fixed', perAppIntellihide, 'sensitive', Gio.SettingsBindFlags.INVERT_BOOLEAN);
		this.settings.bind('intellihide', dockIntellihide, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
		this.settings.bind('autohide', dockPressureControl, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
		this.settings.bind('autohide', dockPressureContainer, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
		
		/* ADDING SETTINGS TO PAGE */
		
		dockSettings.add(dockPlacement);
		dockSettings.add(dockFixed);
		dockSettings.add(dockPreferredMonitor);
		dockSettings.add(dockIconSize);		
		dockSettings.add(dockDimensions);
		dockSettings.add(dockIntellihidePanel);
		dockSettings.add(dockAutohidePanel);    
		dockSettings.add(dockSettingsMainPage);
		dockSettings.add(dockPressureControl);
		notebook.append_page(dockSettings, dockSettingsTitle);

		/* CUSTOMIZATION PAGE */

		let customization = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL});
		let customizationTitle = new Gtk.Label({label: _("Optional")});

		/* CUSTOM THEME */
		let customThemeControl = new Gtk.Box({margin_left:10, margin_top:10, margin_bottom:5, margin_right:10});

		let customThemeLabel = new Gtk.Label({label: _("Apply custom theme (meant to match the default Adwaita theme)"),
												  xalign: 0, hexpand:true});
		let customTheme = new Gtk.Switch({halign:Gtk.Align.END});
				customTheme.set_active(this.settings.get_boolean('apply-custom-theme'));
				customTheme.connect('notify::active', Lang.bind(this, function(check){
					this.settings.set_boolean('apply-custom-theme', check.get_active());
				}));

		customThemeControl.add(customThemeLabel)
		customThemeControl.add(customTheme)
		customization.add(customThemeControl);

		/* OPAQUE LAYER */

		let opaqueLayerControl = new Gtk.Box({margin_left:10, margin_top:10, margin_bottom:10, margin_right:10});

		let opaqueLayerLabel = new Gtk.Label({label: _("Customize the dock background opacity"), xalign: 0, hexpand:true});
		let opaqueLayer = new Gtk.Switch({halign:Gtk.Align.END});
				opaqueLayer.set_active(this.settings.get_boolean('opaque-background'));
				opaqueLayer.connect('notify::active', Lang.bind(this, function(check){
					this.settings.set_boolean('opaque-background', check.get_active());
				}));


		opaqueLayerControl.add(opaqueLayerLabel);
		opaqueLayerControl.add(opaqueLayer);
		customization.add(opaqueLayerControl);

		let opaqueLayerMain = new Gtk.Box({spacing:30, orientation:Gtk.Orientation.HORIZONTAL, homogeneous:false,
										   margin:10});
		indentWidget(opaqueLayerMain);

		let opacityLayerTimeout=0; // Used to avoid to continuosly update the opacity
		let layerOpacityLabel = new Gtk.Label({label: _("Opacity"), use_markup: true, xalign: 0});
		let layerOpacity =  new Gtk.Scale({orientation: Gtk.Orientation.HORIZONTAL, valuePos: Gtk.PositionType.RIGHT});
			layerOpacity.set_range(0, 100);
			layerOpacity.set_value(this.settings.get_double('background-opacity')*100);
			layerOpacity.set_digits(0);
			layerOpacity.set_increments(5,5);
			layerOpacity.set_size_request(200, -1);
			layerOpacity.connect('value-changed', Lang.bind(this, function(button){
				let s = button.get_value()/100;
				if(opacityLayerTimeout>0)
					Mainloop.source_remove(opacityLayerTimeout);
				opacityLayerTimeout = Mainloop.timeout_add(250, Lang.bind(this, function(){
					this.settings.set_double('background-opacity', s);
					return false;
				}));
			}));
		this.settings.bind('opaque-background', opaqueLayerMain, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


		opaqueLayerMain.add(layerOpacityLabel);
		opaqueLayerMain.add(layerOpacity);

		customization.add(opaqueLayerMain);

		/* SWITCH WORKSPACE */

		let switchWorkspaceControl = new Gtk.Box({margin_left:10, margin_top:10, margin_bottom:5, margin_right:10});

		let switchWorkspaceLabel = new Gtk.Label({label: _("Switch workspace when scrolling over the dock"),
												  xalign: 0, hexpand:true});
		let switchWorkspace = new Gtk.Switch({halign:Gtk.Align.END});
				switchWorkspace.set_active(this.settings.get_boolean('scroll-switch-workspace'));
				switchWorkspace.connect('notify::active', Lang.bind(this, function(check){
					this.settings.set_boolean('scroll-switch-workspace', check.get_active());
				}));

		let switchWorkspaceMain = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL, homogeneous:false,
										   margin_left:10, margin_top:5, margin_bottom:10, margin_right:10});
		indentWidget(switchWorkspaceMain);
		let oneAtATime = new Gtk.CheckButton({label: _("Switch one workspace at a time"), margin_bottom: 5});
			oneAtATime.set_active(this.settings.get_boolean('scroll-switch-workspace-one-at-a-time'));
			oneAtATime.connect('toggled', Lang.bind(this, function(check){
				this.settings.set_boolean('scroll-switch-workspace-one-at-a-time', check.get_active());
			}));

		let deadTimeSettings= new Gtk.Box({spacing:30, orientation:Gtk.Orientation.HORIZONTAL, homogeneous:false,
										   margin_bottom:5});
		indentWidget(deadTimeSettings);
		let deadTimeLabel = new Gtk.Label({label: _("Deadtime between each workspace switching [ms]"), use_markup: true, xalign: 0,hexpand:true});
		let deadTime = new Gtk.SpinButton({halign:Gtk.Align.END});
				deadTime.set_sensitive(true);
				deadTime.set_range(0, 1000);
				deadTime.set_value(this.settings.get_int('scroll-switch-workspace-dead-time'));
				deadTime.set_increments(25, 50);
				deadTime.connect('value-changed', Lang.bind(this, function(button){
					let s = button.get_value_as_int();
					this.settings.set_int('scroll-switch-workspace-dead-time', s);
				}));

		let only1px = new Gtk.RadioButton({label: _("Only a 1px wide area close to the screen edge is active")});

			only1px.set_active(!this.settings.get_boolean('scroll-switch-workspace-whole'));
			only1px.connect('toggled', Lang.bind(this, function(check){
				if(check.get_active()) this.settings.set_boolean('scroll-switch-workspace-whole', false);
			}));
		let wholeArea = new Gtk.RadioButton({label: _("All of the dock area active"), group: only1px });
			wholeArea.set_active(this.settings.get_boolean('scroll-switch-workspace-whole'));
			wholeArea.connect('toggled', Lang.bind(this, function(check){
				if(check.get_active()) this.settings.set_boolean('scroll-switch-workspace-whole', true);
			}));

		this.settings.bind('scroll-switch-workspace-one-at-a-time', deadTimeSettings, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


		this.settings.bind('scroll-switch-workspace', switchWorkspaceMain, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

		deadTimeSettings.add(deadTimeLabel);
		deadTimeSettings.add(deadTime);

		switchWorkspaceMain.add(oneAtATime);
		switchWorkspaceMain.add(deadTimeSettings);
		switchWorkspaceMain.add(only1px);
		switchWorkspaceMain.add(wholeArea);

		switchWorkspaceControl.add(switchWorkspaceLabel)
		switchWorkspaceControl.add(switchWorkspace)

		customization.add(switchWorkspaceControl);
		customization.add(switchWorkspaceMain);

		/* CUSTOMIZE CLICK BEHAVIOUR */
	 
		let clickControl = new Gtk.Box({margin_left:10, margin_top:10, margin_bottom:5, margin_right:10});

		let clickLabel = new Gtk.Label({label: _("Customize actions on mouse click"),
												  xalign: 0, hexpand:true});
		let click = new Gtk.Switch({halign:Gtk.Align.END});
			click.set_active(this.settings.get_boolean('customize-click'));
			click.connect('notify::active', Lang.bind(this, function(check){
				this.settings.set_boolean('customize-click', check.get_active());
			}));

		clickControl.add(clickLabel);
		clickControl.add(click);

		let clickMain = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL, homogeneous:false,
										   margin_left:20, margin_top:5, margin_bottom:10, margin_right:10});

		let clickAction =  new Gtk.Box({margin_bottom:5});
			let clickActionLabel = new Gtk.Label({label: _("Action on clicking on running app"), hexpand:true, xalign:0});
			let clickActionCombo = new Gtk.ComboBoxText({halign:Gtk.Align.END});
				clickActionCombo.append_text(_("Do nothing (default)"));
				clickActionCombo.append_text(_("Minimize window(s)"));
				clickActionCombo.append_text(_("Launch new window"));
				clickActionCombo.append_text(_("Cycle the windows"));

				clickActionCombo.set_active(this.settings.get_enum('click-action'));

				clickActionCombo.connect('changed', Lang.bind (this, function(widget) {
						this.settings.set_enum('click-action', widget.get_active());
				}));

		clickAction.add(clickActionLabel)
		clickAction.add(clickActionCombo);

		let minimizeShift =  new Gtk.CheckButton({label: _("Minimize window on shift+click (double click for all app windows)")});
			minimizeShift.set_active(this.settings.get_boolean('minimize-shift'));
			minimizeShift.connect('toggled', Lang.bind(this, function(check){
				this.settings.set_boolean('minimize-shift', check.get_active());
			}));

		clickMain.add(clickAction);
		clickMain.add(minimizeShift);

		this.settings.bind('customize-click', clickMain, 'sensitive', Gio.SettingsBindFlags.DEFAULT);

		customization.add(clickControl);
		customization.add(clickMain);

		notebook.append_page(customization, customizationTitle);
		
		/* APPLETS PAGE */

		let appletsPage = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL});
		let appletsPageTitle = new Gtk.Label({label: _("Applets")});
		
		/* SHOW APPS BUTTON APPLET */
		
		let ShowAppsApplet = new Gtk.Box({margin_left:10, margin_top:10, margin_bottom:5, margin_right:10});

		let ShowAppsAppletLabel = new Gtk.Label({label: _("1. Show Apps"), hexpand: true, halign: Gtk.Align.START});	
		let ShowAppsAppletSwitch = new Gtk.Switch({hexpand: true, halign: Gtk.Align.END});
			ShowAppsAppletSwitch.set_active(this.settings.get_boolean('applet-show-apps-visible'));
			ShowAppsAppletSwitch.connect('notify::active', Lang.bind(this, function(check){
					this.settings.set_boolean('applet-show-apps-visible', check.get_active());
				}));

		ShowAppsApplet.add(ShowAppsAppletLabel);
		ShowAppsApplet.add(ShowAppsAppletSwitch);
		
		/* FAVOURITE APPS APPLET */

		let FavouriteAppsApplet = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL,
			margin_top:10, margin_right:10, margin_bottom:0,  margin_left:10})
			
		let FavouriteAppsAppletContainer = new Gtk.Box();
		
		let FavouriteAppsAppletLabel = new Gtk.Label({label: _("2. Favourite Apps"), hexpand: true, halign: Gtk.Align.START});
		let FavouriteAppsAppletSwitch = new Gtk.Switch({hexpand: true, halign: Gtk.Align.END});
			FavouriteAppsAppletSwitch.set_active(this.settings.get_boolean('applet-favourite-apps-visible'));
			FavouriteAppsAppletSwitch.connect('notify::active', Lang.bind(this, function(check){
					this.settings.set_boolean('applet-favourite-apps-visible', check.get_active());
				}));
				
		let showFavorites =  new Gtk.CheckButton({label: _("Show Favorite applications")});
			showFavorites.set_active(this.settings.get_boolean('show-favorites'));
			showFavorites.connect('toggled', Lang.bind(this, function(check){
				this.settings.set_boolean('show-favorites', check.get_active());
			}));
		indentWidget(showFavorites);			
		let showRunning =  new Gtk.CheckButton({label: _("Show Running applications")});
			showRunning.set_active(this.settings.get_boolean('show-running'));
			showRunning.connect('toggled', Lang.bind(this, function(check){
				this.settings.set_boolean('show-running', check.get_active());
			}));
		indentWidget(showRunning);
		
		FavouriteAppsAppletContainer.add(FavouriteAppsAppletLabel);
		FavouriteAppsAppletContainer.add(FavouriteAppsAppletSwitch);
		FavouriteAppsApplet.add(FavouriteAppsAppletContainer);
		FavouriteAppsApplet.add(showFavorites);
		FavouriteAppsApplet.add(showRunning);		

		/* LINKS TRAY APPLET */
		
		let LinksTrayApplet = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL, 
			margin_left:10, margin_top:10, margin_bottom:5, margin_right:10});
		
		let LinksTrayAppletContainer = new Gtk.Box({orientation:Gtk.Orientation.HORIZONTAL, margin_bottom: 5});

		let LinksTrayAppletLabel = new Gtk.Label({label: _("3. Links Tray"), hexpand: true, halign: Gtk.Align.START});	
		let LinksTrayAppletSwitch = new Gtk.Switch({hexpand: true, halign: Gtk.Align.END});
			LinksTrayAppletSwitch.set_active(this.settings.get_boolean('applet-links-tray-visible'));
			LinksTrayAppletSwitch.connect('notify::active', Lang.bind(this, function(check){
					this.settings.set_boolean('applet-links-tray-visible', check.get_active());
				}));

		LinksTrayAppletContainer.add(LinksTrayAppletLabel);
		LinksTrayAppletContainer.add(LinksTrayAppletSwitch);

		let LinksTraySwitchToGridContainer = new Gtk.Box({orientation:Gtk.Orientation.HORIZONTAL, spacing:30, 
			homogeneous:false, margin_bottom:5});
		indentWidget(LinksTraySwitchToGridContainer);
		
		let LinksTraySwitchToGridLabel = new Gtk.Label({label: _("No. icons to show before switching to grid layout"),
			use_markup: true, xalign: 0, hexpand:true});
		let LinksTraySwitchToGrid = new Gtk.SpinButton({halign:Gtk.Align.END});
			LinksTraySwitchToGrid.set_sensitive(true);
			LinksTraySwitchToGrid.set_range(1, 15);
			LinksTraySwitchToGrid.set_value(this.settings.get_int('applet-links-tray-to-grid'));
			LinksTraySwitchToGrid.set_increments(1, 2);
			LinksTraySwitchToGrid.connect('value-changed', Lang.bind(this, function(button){
					let s = button.get_value_as_int();
					this.settings.set_int('applet-links-tray-to-grid', s);
				}));
		LinksTraySwitchToGridContainer.add(LinksTraySwitchToGridLabel);
		LinksTraySwitchToGridContainer.add(LinksTraySwitchToGrid);

		LinksTrayApplet.add(LinksTrayAppletContainer);
		LinksTrayApplet.add(LinksTraySwitchToGridContainer);

		/* SHOW DESKTOP APPLET */
		
		let ShowDesktopApplet = new Gtk.Box({margin_top:10, margin_right:10, margin_bottom:5, margin_left:10});

		let ShowDesktopAppletLabel = new Gtk.Label({label: _("4. Show Desktop"), hexpand: true, halign: Gtk.Align.START});	
		let ShowDesktopAppletSwitch = new Gtk.Switch({hexpand: true, halign: Gtk.Align.END});
			ShowDesktopAppletSwitch.set_active(this.settings.get_boolean('applet-show-desktop-visible'));
			ShowDesktopAppletSwitch.connect('notify::active', Lang.bind(this, function(check){
					this.settings.set_boolean('applet-show-desktop-visible', check.get_active());
				}));

		ShowDesktopApplet.add(ShowDesktopAppletLabel);
		ShowDesktopApplet.add(ShowDesktopAppletSwitch);
		
		/* RECYCLING BIN APPLET */
		
		let RecyclingBinApplet = new Gtk.Box({margin_left:10, margin_top:10, margin_bottom:5, margin_right:10});

		let RecyclingBinAppletLabel = new Gtk.Label({label: _("5. Recycling Bin"), hexpand: true, halign: Gtk.Align.START});	
		let RecyclingBinAppletSwitch = new Gtk.Switch({hexpand: true, halign: Gtk.Align.END});
			RecyclingBinAppletSwitch.set_active(this.settings.get_boolean('applet-recycling-bin-visible'));
			RecyclingBinAppletSwitch.connect('notify::active', Lang.bind(this, function(check){
					this.settings.set_boolean('applet-recycling-bin-visible', check.get_active());
				}));

		RecyclingBinApplet.add(RecyclingBinAppletLabel);
		RecyclingBinApplet.add(RecyclingBinAppletSwitch);
					
		/* ORDER OF APPLETS */
		
		let OrderOfApplets = new Gtk.Box({ orientation:Gtk.Orientation.VERTICAL, 
			margin_left:10, margin_top:10, margin_right:10, margin_bottom:5 });

		let ordering = this.settings.get_string('applets-order');

		let storeOrder = new Gtk.ListStore();
			storeOrder.set_column_types ([GObject.TYPE_STRING, GObject.TYPE_STRING]);
            
		for (let i = 0; i < ordering.length ;i++) {
			switch (ordering[i]) {
					case '1':
						storeOrder.set (storeOrder.append(), [0, 1], ["Show Apps", 1]);
						break;
					case '2':
						storeOrder.set (storeOrder.append(), [0, 1], ["Favourite Apps", 2]);
						break;
					case '3':
						storeOrder.set (storeOrder.append(), [0, 1], ["Links Tray", 3]);
						break;
					case '4':
						storeOrder.set (storeOrder.append(), [0, 1], ["Show Desktop", 4]);
						break;
					case '5':
						storeOrder.set (storeOrder.append(), [0, 1], ["Recycling Bin", 5]);
						break;
					default:
						break;
			}
		}            

		let treeOrder = new Gtk.TreeView({ model: storeOrder, margin_right:10, margin_bottom:10, margin_left:10 });
	
		let normal = new Gtk.CellRendererText ();
		let firstColumn = new Gtk.TreeViewColumn ({ title: _("Order of Applets") });
			firstColumn.pack_start (normal, true);
			firstColumn.add_attribute (normal, "text", 0);
			treeOrder.insert_column (firstColumn, 0);
			
		let treeOrderSelection = treeOrder.get_selection();
		
		let OrderOfAppletsButtons = new Gtk.Box({ margin_left:10, margin_top:10, margin_bottom:5, margin_right:10 });		
		
		let btnMoveAppletUp = new Gtk.Button({ label: "↑", hexpand: true, halign: Gtk.Align.END });
			btnMoveAppletUp.connect('clicked', Lang.bind (this, function(widget) {
				let [ isSelected, model, iter ] = treeOrderSelection.get_selected();
				let previous_exists = storeOrder.iter_previous(iter);		
				let [ isSelected, model, iter_previous ] = treeOrderSelection.get_selected();
				if (previous_exists) {
					storeOrder.swap(iter, iter_previous);
					let new_ordering = '';
					storeOrder.foreach(function (for_model, for_path, for_iter, for_data) {
						new_ordering += storeOrder.get_value (for_iter, 1);
					});
					this.settings.set_string('applets-order', new_ordering);
				}
			}));
			
		let btnMoveAppletDown = new Gtk.Button({ label: "↓", halign: Gtk.Align.END });
			btnMoveAppletDown.connect('clicked', Lang.bind (this, function(widget) {
				let [ isSelected, model, iter ] = treeOrderSelection.get_selected();
				let next_exists = storeOrder.iter_next(iter);		
				let [ isSelected, model, iter_next ] = treeOrderSelection.get_selected();
				if (next_exists) {
					storeOrder.swap(iter, iter_next);
					let new_ordering = '';
					storeOrder.foreach(function (for_model, for_path, for_iter, for_data) {
						new_ordering += storeOrder.get_value (for_iter, 1);
					});
					this.settings.set_string('applets-order', new_ordering);
				}
			}));			

		OrderOfAppletsButtons.add(btnMoveAppletUp);
		OrderOfAppletsButtons.add(btnMoveAppletDown);
		OrderOfApplets.add(treeOrder);
		OrderOfApplets.add(OrderOfAppletsButtons);
		
		this.settings.bind('applet-favourite-apps-visible', showFavorites, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
		this.settings.bind('applet-favourite-apps-visible', showRunning, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
		
		/* ADDING SETTINGS TO PAGE */
		
		appletsPage.add(ShowAppsApplet);		
		appletsPage.add(FavouriteAppsApplet);
		appletsPage.add(LinksTrayApplet);		
		appletsPage.add(ShowDesktopApplet);			
		appletsPage.add(RecyclingBinApplet);
		appletsPage.add(OrderOfApplets);
		
		notebook.append_page(appletsPage, appletsPageTitle);
		this.add(notebook);
    }
});

function init() {
    Convenience.initTranslations();
}

function buildPrefsWidget() {
    let widget = new WorkspaceSettingsWidget({orientation: Gtk.Orientation.VERTICAL, spacing:5, border_width:5});
    widget.show_all();

    return widget;
}


/* Add a margin to the widget: left margin in LTR, right margin in RTL */
function indentWidget(widget){

    let indent = 20;

    if(Gtk.Widget.get_default_direction()==Gtk.TextDirection.RTL){
        widget.set_margin_right(indent);
    } else {
        widget.set_margin_left(indent);
    }
}
