/* -*- mode: js; js-basic-offset: 4; indent-tabs-mode: nil -*- */

/*
 * Part of this file comes from gnome-shell-extensions:
 * http://git.gnome.org/browse/gnome-shell-extensions/
 * 
 */

const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const Lang = imports.lang;

const Config = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;


/**
 * initTranslations:
 * @domain: (optional): the gettext domain to use
 *
 * Initialize Gettext to load translations from extensionsdir/locale.
 * If @domain is not provided, it will be taken from metadata['gettext-domain']
 */
function initTranslations(domain) {
    let extension = ExtensionUtils.getCurrentExtension();

    domain = domain || extension.metadata['gettext-domain'];

    // check if this extension was built with "make zip-file", and thus
    // has the locale files in a subfolder
    // otherwise assume that extension has been installed in the
    // same prefix as gnome-shell
    let localeDir = extension.dir.get_child('locale');
    if (localeDir.query_exists(null))
        Gettext.bindtextdomain(domain, localeDir.get_path());
    else
        Gettext.bindtextdomain(domain, Config.LOCALEDIR);
}

/**
 * getSettings:
 * @schema: (optional): the GSettings schema id
 *
 * Builds and return a GSettings schema for @schema, using schema files
 * in extensionsdir/schemas. If @schema is not provided, it is taken from
 * metadata['settings-schema'].
 */
function getSettings(schema) {
    let extension = ExtensionUtils.getCurrentExtension();

    schema = schema || extension.metadata['settings-schema'];

    const GioSSS = Gio.SettingsSchemaSource;

    // Check if this extension was built with "make zip-file", and thus
    // has the schema files in a subfolder otherwise assume that extension 
    // has been installed in the same prefix as gnome-shell (and therefore 
    // schemas are available in the standard folders)
    let schemaDir = extension.dir.get_child('schemas');
    let schemaSource;
    if (schemaDir.query_exists(null))
        schemaSource = GioSSS.new_from_directory(schemaDir.get_path(),
                                                 GioSSS.get_default(),
                                                 false);
    else
        schemaSource = GioSSS.get_default();

    let schemaObj = schemaSource.lookup(schema, true);
    if (!schemaObj)
        throw new Error('Schema ' + schema + ' could not be found for extension '
                        + extension.metadata.uuid + '. Please check your installation.');
	
    return new Gio.Settings({ settings_schema: schemaObj });
}

/* Simplify global signals handling */
const globalSignalHandler = new Lang.Class({
    Name: 'dashToDock.globalSignalHandler',

    _init: function(){
        this._signals = new Object();
    },

    push: function(/*unlimited 3-long array arguments*/){
        this._addSignals('generic', arguments);
    },

    disconnect: function() {
        for( let label in this._signals )
            this.disconnectWithLabel(label);
    },

    pushWithLabel: function( label /* plus unlimited 3-long array arguments*/) {

        // skip first element of thearguments array;
        let elements = new Array;
        for(let i = 1 ; i< arguments.length; i++)
            elements.push(arguments[i]);

        this._addSignals(label, elements);
    },

    _addSignals: function(label, elements) {
        if(this._signals[label] == undefined)
            this._signals[label] = new Array();

        for( let i = 0; i < elements.length; i++ ) { 
            let object = elements[i][0];
            let event = elements[i][1];

            let id = object.connect(event, elements[i][2]);
            this._signals[label].push( [ object , id ] );
        }
    },

    disconnectWithLabel: function(label) {

        if(this._signals[label]) {
            for( let i = 0; i < this._signals[label].length; i++ ) {
                this._signals[label][i][0].disconnect(this._signals[label][i][1]);
            }

            delete this._signals[label];
        }
    }
});

/**
 *  File and JSON database management. Stores and parses
 *  the information needed to make a link to a file or a
 *  directory. This is primarily used in "linksTray".
 */
const LinksDB = new Lang.Class({
    Name: 'dashToDock.LinksDB',
    
    _init: function() {
		this.links_data = null;
		this.string_data = null;
		this.check_or_make_directory();
	},

	check_or_make_directory: function() {
		let path = ExtensionUtils.getCurrentExtension().path+'/data';
		let dir = Gio.file_new_for_path(path);
		
		if (!GLib.file_test(path, GLib.FileTest.EXISTS)) {
			dir.make_directory(null);
		} else {
			this.open_or_make_db();
		}
	},

	open_or_make_db: function() {
		let path = ExtensionUtils.getCurrentExtension().path+'/data/'+'links_tray_db.json';
		let file = Gio.file_new_for_path(path);

		let fstream = null;
		if (!GLib.file_test(path, GLib.FileTest.EXISTS)) {
			fstream = file.create(Gio.FileCreateFlags.NONE, null);
			this.links_data = {folders: []};			

			this.string_data = JSON.stringify(this.links_data);
			fstream.write(this.string_data, null, this.string_data.length);
		} else {
			log("IT EXisto");
			fstream = file.open_readwrite(null).get_input_stream();
			let size = file.query_info("standard::size",
				Gio.FileQueryInfoFlags.NONE, null).get_size();
				
			this.string_data = fstream.read_bytes(size, null).get_data();
			try {
				this.links_data = JSON.parse(this.string_data);
			} catch(e) {
				log(_("The file "+path+" is not a meaningful JSON database. Check it!"));
				file.set_display_name((file.get_basename()+'.'+(Math.round(Math.random()*10000))), null); 
			}
		}
		fstream.close(null);
	},
	
	save_db: function() {
		this.links_data.folders = this.links_data.folders
			.filter(function(n){ return n != null });

		this.string_data = JSON.stringify(this.links_data);
	
		try {
			let path = ExtensionUtils.getCurrentExtension().path+'/data/'+'links_tray_db.json';
			let file = Gio.file_new_for_path(path);
			//let fstream = file.open_readwrite(null).get_output_stream();
			let fstream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
			fstream.write(this.string_data, null, this.string_data.length);
			fstream.close(null);
		} catch (e) {
			log("Error when saving file  "+e.message);
		}
	},
	
	add_tray: function(id) {
		this.links_data.folders.push( { collection_id: id, links_array: []} );
		this.save_db();
	},

	remove_tray: function(id) {
		for(let i = 0; i < this.links_data.folders.length ;i++) {
			if (id == this.links_data.folders[i].collection_id) {
				delete this.links_data.folders[i];
				this.save_db();
			}
		}
	},
	
	free_tray_contents: function(id) {
		for(let i = 0; i < this.links_data.folders.length ;i++) {
			if (id == this.links_data.folders[i].collection_id) {
				this.links_data.folders[i].links_array = [];
				this.save_db();
			}
		}
	},
	
	move_tray: function(trayId, trayPos) {
		let current_position;

		for(let i = 0; i < this.links_data.folders.length ;i++) {
			if (trayId == this.links_data.folders[i].collection_id) {
				current_position = i;
			}
		}

		var cache = this.links_data.folders[current_position];
		this.links_data.folders[current_position] = this.links_data.folders[trayPos];
		this.links_data.folders[trayPos] = cache;

		this.save_db();
	},	
	
	/* lid = link id */
	add_link_to_tray: function(id, lid, file) {
		for(let i = 0; i < this.links_data.folders.length ;i++) {
			if (id == this.links_data.folders[i].collection_id) {
				this.links_data.folders[i].links_array
					.push({"id":lid,"link":file.get_path()});
				this.save_db();
			}
		}
	},
	
	move_link_in_tray: function(trayId, new_lid, old_lid) {	
		let trayIndex;
		let new_lid_position;
		let old_lid_position;
		for(let i = 0; i < this.links_data.folders.length ;i++) {		
			if (trayId == this.links_data.folders[i].collection_id) {
				trayIndex = i;
				for(let k = 0; k < this.links_data.folders[i].links_array.length ;k++) {
					for(let j = 0; j < this.links_data.folders[i].links_array.length ;j++) {
						if (new_lid == this.links_data.folders[i].links_array[j].id) {
							new_lid_position = j;
						}
						
						if (old_lid == this.links_data.folders[i].links_array[j].id) {
							old_lid_position = j;
						}
					}
				}
			}
		}

		let cache = this.links_data.folders[trayIndex].links_array[old_lid_position];
		this.links_data.folders[trayIndex].links_array[old_lid_position] = this.links_data.folders[trayIndex].links_array[new_lid_position];
		this.links_data.folders[trayIndex].links_array[new_lid_position] = cache;

		this.links_data.folders[trayIndex].links_array = this.links_data
			.folders[trayIndex].links_array.filter(function(n){ return n != null });
		
		this.save_db();
	},
	
	remove_link_from_tray: function(id, lid) {
		for(let i = 0; i < this.links_data.folders.length ;i++) {
			if (id == this.links_data.folders[i].collection_id) {
				for(let k = 0; k < this.links_data.folders[i].links_array.length ;k++) {
					delete this.links_data.folders[i].links_array[k];
					this.save_db();
				}
			}
		}
	}
});
