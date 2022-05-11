#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#    This program is free software: you can redistribute it and/or modify
#   it under the terms of the GNU General Public License as published by
#   the Free Software Foundation; either version 3 of the License, or
#   (at your option) any later version.
#
#   This program is distributed in the hope that it will be useful,
#   but WITHOUT ANY WARRANTY; without even the implied warranty of
#   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#   GNU General Public License for more details.
#
#   You should have received a copy of the GNU General Public License
#   along with this program.  If not, see <https://www.gnu.org/licenses/>.

import os
import sys

from gi import require_version
require_version('Gdk', '3.0')
require_version('Gtk', '3.0')
require_version('Gegl', '0.4')
require_version('GimpUi', '3.0')
require_version('Gimp', '3.0')

from gi.repository import Gdk, Gegl, Gimp, GimpUi, Gio, GLib, Gtk, GObject

import json
import math
import os.path


class SpineExport(Gimp.PlugIn):
    # GimpPlugIn virtual methods ##
    def do_query_procedures(self):
        return ["spine-export"]

    def do_create_procedure(self, name):
        procedure = Gimp.ImageProcedure.new(self, name,
                                            Gimp.PDBProcType.PLUGIN,
                                            self.run, None)

        procedure.set_image_types("*")
        procedure.set_sensitivity_mask(Gimp.ProcedureSensitivityMask.DRAWABLE)

        procedure.set_menu_label("Spine Export")
        procedure.set_icon_name(GimpUi.ICON_GEGL)
        procedure.add_menu_path('<Image>/File/')

        procedure.set_documentation("Export Layers for Spine",
                                    "Spine Exporter",
                                    name)
        procedure.set_attribution("Kolja", "Lubitz", "2022")

        return procedure

    def spine_export(self, img, compression, dir_name, crop_layers):
        ''' Plugin entry point
        '''

        # Set up the initial JSON format
        output = {
            'bones': [{'name': 'root'}],
            'slots': [],
            'skins': {'default': {}},
            'animations': {}
        }
        slots = output['slots']
        attachments = output['skins']['default']

        # Iterate through the layers, extracting their info into the JSON output
        # and saving the layers as individual images
        for layer in img.get_layers():
            if '[ignore]' in layer.get_name():
                continue

            if layer.get_visible():
                if crop_layers:
                    img.active_layer = layer
                    width = layer.get_width()
                    height = layer.get_height()
                    offsets = layer.get_offsets()

                    # pdb.plug_in_autocrop_layer(img, layer)
                    Gimp.get_pdb().run_procedure('plug-in-autocrop-layer',
                                                 [Gimp.RunMode.NONINTERACTIVE,
                                                  GObject.Value(
                                                      Gimp.Image, img),
                                                  GObject.Value(Gimp.Drawable, layer)])

                to_save = self.process_layer(img, layer, slots, attachments)
                self.save_layers(img, to_save, compression, dir_name)

                if crop_layers:
                    img.active_layer = layer
                    offsets_new = layer.get_offsets()
                    layer.resize(width, height, - offsets.offset_x + offsets_new.offset_x, - offsets.offset_y + offsets_new.offset_y)

        # Write the JSON output
        name = os.path.splitext(os.path.basename(img.get_file().get_basename()))[0]
        with open(os.path.join(dir_name, '%s.json' % name), 'w') as json_file:
            json.dump(output, json_file)

    def process_layer(self, img, layer, slots, attachments):
        ''' Extracts the Spine info from each layer, recursing as necessary on
            layer groups. Returns all the layers it processed in a flat list.
        '''
        processed = []

        # If this layer is a layer has sublayers, recurse into them
        if hasattr(layer, 'layers'):
            for sublayer in layer.layers:
                processed.extend(self.process_layer(
                    img, sublayer, slots, attachments))
        else:
            layer_name = layer.get_name()

            slots.insert(0, {
                'name': layer_name,
                'bone': 'root',
                'attachment': layer_name,
            })
            offsets = layer.get_offsets()
            x = offsets.offset_x
            y = offsets.offset_y

            # Compensate for GIMP using the top left as the origin, vs Spine using the center.
            x += math.floor(layer.get_width() / 2)
            y += math.floor(layer.get_height() / 2)

            # Center the image on Spine's x origin,
            x -= math.floor(img.get_width() / 2)

            # Compensate for GIMP's y axis going from top to bottom, vs Spine going bottom to top
            y = img.get_height() - y

            attachments[layer_name] = {layer_name: {
                'x': x,
                'y': y,
                'rotation': 0,
                'width': layer.get_width(),
                'height': layer.get_height(),
            }}
            processed.append(layer)

        return processed

    def save_layers(self, img, layers, compression, dir_name):
        ''' Takes a list of layers and saves them in `dir_name` as PNGs,
            naming the files after their layer names.
        '''

        for layer in layers:
            tmp_img = Gimp.get_pdb().run_procedure(
                'gimp-image-new',
                [
                    GObject.Value(
                        GObject.TYPE_INT, img.get_width()),
                    GObject.Value(
                        GObject.TYPE_INT, img.get_height()),
                    GObject.Value(
                        Gimp.ImageBaseType, img.get_base_type()),
                ])

            tmp_layer = Gimp.get_pdb().run_procedure(
                'gimp-layer-new-from-drawable',
                [
                    GObject.Value(Gimp.Layer, layer),
                    GObject.Value(Gimp.Image, tmp_img.index(1)),
                ])

            tmp_layer.name = layer.get_name()
            tmp_img.index(1).insert_layer(tmp_layer.index(1), None, 0)
            filename = '%s.png' % layer.get_name()
            fullpath = os.path.join(dir_name, filename)
            tmp_img.index(1).resize_to_layers()
            file = Gio.file_new_for_path(fullpath)

            Gimp.get_pdb().run_procedure(
                'file-png-save',
                [Gimp.RunMode.NONINTERACTIVE,
                 GObject.Value(Gimp.Image, tmp_img.index(1)),
                 GObject.Value(GObject.TYPE_INT, 1),
                 GObject.Value(Gimp.ObjectArray, Gimp.ObjectArray.new(Gimp.Drawable, tmp_img.index(1).get_layers(), False)),
                 GObject.Value(Gio.File, file),
                 GObject.Value(GObject.TYPE_INT, 0),
                 GObject.Value(GObject.TYPE_INT, compression),
                 GObject.Value(GObject.TYPE_INT, 1),
                 GObject.Value(GObject.TYPE_INT, 1),
                 GObject.Value(GObject.TYPE_INT, 1),
                 GObject.Value(GObject.TYPE_INT, 1),
                 GObject.Value(GObject.TYPE_INT, 1),
                 ])

    def run(self, procedure, run_mode, image, n_drawables, drawables, args, run_data):
        folder = os.path.dirname(image.get_file().get_path())

        if run_mode == Gimp.RunMode.INTERACTIVE:
            GimpUi.init("Gimp3ToSpine.py")

            dialog = GimpUi.Dialog(use_header_bar=True,
                                   title=("Spine Export"),
                                   role="Gimp3ToSpine")

            dialog.add_button("Cancel", Gtk.ResponseType.CANCEL)
            dialog.add_button("OK", Gtk.ResponseType.OK)

            geometry = Gdk.Geometry()
            geometry.min_aspect = 0.5
            geometry.max_aspect = 1.0
            dialog.set_geometry_hints(None, geometry, Gdk.WindowHints.ASPECT)

            box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2)
            dialog.get_content_area().add(box)
            box.show()

            # Create grid to set all the properties inside.
            grid = Gtk.Grid()
            grid.set_column_homogeneous(False)
            grid.set_border_width(10)
            grid.set_column_spacing(10)
            grid.set_row_spacing(10)
            box.add(grid)
            grid.show()

            # UI for the file parameter

            def choose_file(widget):
                if file_chooser_dialog.run() == Gtk.ResponseType.OK:
                    if file_chooser_dialog.get_file() is not None:
                        # folder = file_chooser_dialog.get_file().get_path()
                        file_entry.set_text(file_chooser_dialog.get_file().get_path())
                file_chooser_dialog.hide()

            file_chooser_button = Gtk.Button.new_with_mnemonic(label=("Folder..."))
            grid.attach(file_chooser_button, 0, 0, 1, 1)
            file_chooser_button.show()
            file_chooser_button.connect("clicked", choose_file)

            file_entry = Gtk.Entry.new()
            grid.attach(file_entry, 1, 0, 1, 1)
            file_entry.set_width_chars(40)
            file_entry.set_placeholder_text(("Choose export folder..."))

            file_entry.set_text(folder)
            file_entry.show()

            file_chooser_dialog = Gtk.FileChooserDialog(use_header_bar=True,
                                                        title=("Export folder..."),
                                                        action=Gtk.FileChooserAction.SELECT_FOLDER)
            file_chooser_dialog.add_button("Cancel", Gtk.ResponseType.CANCEL)
            file_chooser_dialog.add_button("OK", Gtk.ResponseType.OK)

            while (True):
                response = dialog.run()
                if response == Gtk.ResponseType.OK:
                    self.spine_export(image, 9, file_entry.get_text(), 1)
                    dialog.destroy()
                    break
                else:
                    dialog.destroy()
                    return procedure.new_return_values(Gimp.PDBStatusType.CANCEL,
                                                       GLib.Error())

        return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, GLib.Error())


Gimp.main(SpineExport.__gtype__, sys.argv)
