#!/usr/bin/env python
"""
Exports layers to images and outputs a Spine JSON file.
http://esotericsoftware.com/spine-json-format

To install, place this file in: *install*/lib/gimp/*version*/plug-ins/
Where *install* is the GIMP installation folder and *version* is the GIMP version.

To run, in GIMP choose: File -> Export to Spine

Original hosting location:
https://github.com/clofresh/gimp-spine
"""

# TODO: bones don't work for groups
# TODO: implement skin tags
# TODO: implement slots (makes only sense for groups?)


# TODO: Tags
# -- Groups and Layers --
    # [bone] [bone:name]     - Layers, slots, and bones are placed under a bone. The bone is created at the center of a visible layer. Bone groups can be nested.
    # [slot] [slot:name]     - Layers are placed in a slot.
    # [skin] [skin:name]     - Layers are placed in a skin. Skin layer images are output in a subfolder for the skin.
    # [scale:number]         - Layers are scaled. Their attachments are scaled inversely, so they appear the same size in Spine.
    # [overlay]              - This layer is used as a clipping mask for all layers below.
    # [mesh] [mesh:name]     - Layer is a mesh or, when a name is specified, a linked mesh.

# [folder] [folder:name] - Layer images are output in a subfolder. Folder groups can be nested.
# [trim] [trim:false]    - Force this layer to be whitespace trimmed or not.
# [ignore]               - Layers, groups, and any child groups will not be output.

# -- Groups --
# [merge]                - Layers in the group are merged and a single image is output.

import errno
import json
import math
import os
import os.path
import re

import gimpfu
from gimp import pdb, progress_init, progress_update


layer_name_regex = re.compile(r"(\[ignore\])|(\[merge\])|(\[trim\])|(\[trim:false\])|(\[folder(:.*?)?\])|(\[bone(:.*?)?\])|(\[slot(:.*?)?\])|(\[skin(:.*?)?\])|(\[scale(:.*?)?\])|(\[mesh(:.*?)?\])|(\[overlay\])", re.IGNORECASE)
folder_regex = re.compile(r"\[folder(:(.+?))?\]", re.IGNORECASE)
bone_regex = re.compile(r"\[bone(:(.+?))?\]", re.IGNORECASE)


class SpineExporter(object):
    """
    Handles tags and processes layers for the export to Spine
    """
    def __init__(self, original_img):
        """
        Initializes the class and makes a copy of the image
        in order to not mess with the original
        """
        try:
            self._original_name = os.path.splitext(os.path.basename(original_img.filename))[0]
        except Exception:
            self._original_name = "not_saved"

        self._img = pdb.gimp_image_duplicate(original_img)
        self._json_output = {
            "bones": [{"name": "root"}],
            "slots": [],
            "skins": {"default": {}},
            "animations": {},
        }
        self._slots = self._json_output["slots"]
        self._attachments = self._json_output["skins"]["default"]


    def __del__(self):
        """
        Cleans up the temporarily created image
        """
        pdb.gimp_image_delete(self._img)


    def export(self, path, ignore_hidden_layers, compression):
        """
        Exports the image to the given path.
        If ignore_hidden_layers is set to True, only visible layers and groups will be exported
        The parameter compression is the PNG compression from 0-9
        """
        self._layer_count = self._count_layers(self._img.layers)
        self._processed_layers = 0
        self._export_layers(self._img.layers, False, path, "", ignore_hidden_layers, compression)

        # Write the JSON output
        with open(os.path.join(path, "%s.json" % self._original_name), "w") as json_file:
            json.dump(self._json_output, json_file, indent = 4)
        return self._json_output


    def _export_layers(self, layers, trim_layers, path, local_path, ignore_hidden_layers, compression):
        """
        Iterates through all layers (recursively), applies the tags in the layer name
        and exports the layers to PNG files.
        """
        for layer in layers:
            self._processed_layers += 1

            progress_init(layer.name)
            progress_update(float(self._processed_layers) / self._layer_count)

            if (ignore_hidden_layers and not layer.visible) or "[ignore]" in layer.name.lower():
                continue

            # handle [folder] or [folder:name] tags
            folder_tag = self._get_folder_tag(layer.name)
            if folder_tag is not None:
                path = os.path.join(path, folder_tag)
                local_path += folder_tag + "/"

            if "[trim]" in layer.name.lower():
                trim_layers = True
            elif "[trim:false]" in layer.name.lower():
                trim_layers = False

            if self._is_group_layer(layer):
                if "[merge]" in layer.name.lower():
                    merged_layer = pdb.gimp_image_merge_layer_group(layer.image, layer)
                    if trim_layers:
                        self._trim_layer(merged_layer)

                    layer_name = self._remove_tags(merged_layer.name)
                    self._export_layer_as_png(merged_layer, compression, path, local_path, layer_name)
                else:
                    self._export_layers(layer.layers, trim_layers, path, local_path, ignore_hidden_layers, compression)
            else:
                if trim_layers:
                    self._trim_layer(layer)

                layer_name = self._remove_tags(layer.name)
                self._export_layer_as_png(layer, compression, path, local_path, layer_name)


    def _count_layers(self, layers):
        """
        Counts the number of relevant layers in order to be able to show a progress bar
        """
        count = 0
        for layer in layers:
            if self._is_group_layer(layer) and not "[merge]" in layer.name.lower():
                count += self._count_layers(layer.layers)
            count += 1
        return count


    def _get_folder_tag(self, layer_name):
        """
        Extracts a folder tag from a layer name.
        - If the folder tag has a parameter [folder:some-name], it will be returned ("some-name")
        - If the folder tag has no parameter, the layer name (without tags will be returned)
        - If there is no folder tag, None is returned
        """
        folder_tags = folder_regex.findall(layer_name)
        if len(folder_tags) > 0:
            folder_tag = folder_tags[-1][1] # always take the last one; and in a pair of (':foo', 'foo') the second one
            # [folder] case
            if folder_tag == "":
                return self._remove_tags(layer_name)
            # [folder:<some name>] case
            else:
                return folder_tag
        return None


    def _get_bone_tag(self, layer_name):
        """
        Extracts a bone tag from a layer name.
        - If the bone tag has a parameter [bone:some-name], it will be returned ("some-name")
        - If the bone tag has no parameter, the layer name (without tags will be returned)
        - If there is no bone tag, None is returned
        """
        folder_tags = bone_regex.findall(layer_name)
        if len(folder_tags) > 0:
            folder_tag = folder_tags[-1][1] # always take the last one; and in a pair of (':foo', 'foo') the second one
            # [folder] case
            if folder_tag == "":
                return self._remove_tags(layer_name)
            # [folder:<some name>] case
            else:
                return folder_tag
        return None


    def _is_group_layer(self, layer):
        """
        Returns True if the layer is a group
        """
        return hasattr(layer, "layers")


    def _remove_tags(self, layer_name):
        """
        Removes tags from layer names
        """
        return layer_name_regex.sub("", layer_name)


    def _create_bone(self, name, x, y, length):
        """
        Creates a bone in JSON metadata
        """
        if not any([e for e in self._json_output["bones"] if e["name"] == name]):
            self._json_output["bones"].append({
                "name": name,
                "x": x,
                "y": y,
                "length": length,
                "parent": "root"
            })


    def _trim_layer(self, layer):
        """
        uses the Gimp autocrop feature to trim the layer
        """
        self._img.active_layer = layer
        pdb.plug_in_autocrop_layer(self._img, layer)

    
    def _collect_layer_information(self, layer, local_path):
        """
        Extracts the Spine info from a layer
        """
        x, y = layer.offsets

        # Compensate for GIMP using the top left as the origin, vs Spine using the center.
        x += math.floor(layer.width / 2)
        y += math.floor(layer.height / 2)

        # Center the image on Spine"s x origin,
        x -= math.floor(self._img.width / 2)

        # Compensate for GIMP"s y axis going from top to bottom, vs Spine going bottom to top
        y = self._img.height - y

        layer_name = self._remove_tags(layer.name)
        layer_name = local_path + layer_name

        bone_name = self._get_bone_tag(local_path + layer.name)
        if bone_name is None:
            bone_name = "root"
        else:
            self._create_bone(bone_name, x, y, layer.width / 2)
            x = 0
            y = 0

        self._slots.insert(0, {
            "name": layer_name,
            "bone": bone_name,
            "attachment": layer_name,
        })

        self._attachments[layer_name] = {layer_name: {
            "x": x,
            "y": y,
            "rotation": 0,
            "width": layer.width,
            "height": layer.height,
        }}

    def _make_dirs(self, path):
        """
        Recursively creates the necessary directories for the given path.
        This is necessary, since Gimp 2.10 uses Python 2, which does not
        support the `exist_ok` argument. In  Python 3, one could simply use:
        
        `os.makedirs(file_path, exist_ok = True)`
        """
        try:
            os.makedirs(path)
        except OSError as e:
            if e.errno != errno.EEXIST:
                raise

            if os.path.isfile(path):
                # folder is a file, raise OSError just like os.makedirs() in Py3
                raise

    def _export_layer_as_png(self, layer, compression, file_path, local_path, file_name):
        """
        Saves a layer of the given image to the given file path (as PNG)
        """
        # collect layer information for JSON output
        self._collect_layer_information(layer, local_path)

        # export the PNG file
        self._make_dirs(file_path)
        file_name += ".png"
        tmp_img = pdb.gimp_image_new(self._img.width, self._img.height, self._img.base_type)
        tmp_layer = pdb.gimp_layer_new_from_drawable(layer, tmp_img)
        tmp_layer.name = layer.name
        tmp_img.add_layer(tmp_layer, 0)
        full_path = os.path.join(file_path, file_name)
        tmp_img.resize_to_layers()
        pdb.file_png_save(
            tmp_img,
            tmp_img.layers[0],
            full_path,
            file_name,
            0,            # interlace
            compression,  # compression
            0,            # bkgd
            0,            # gama
            0,            # offs
            0,            # phys
            0             # time
        )
        pdb.gimp_image_delete(tmp_img)


def spine_export(img, active_layer, compression, dir_name, ignore_hidden_layers):
    """
    Plugin entry point
    """
    exporter = SpineExporter(img)
    exporter.export(dir_name, ignore_hidden_layers, compression)


gimpfu.register(
    # name
    "spine-export",
    # blurb
    "Spine export",
    # help
    "Exports layers to images and outputs a Spine JSON file",
    # author
    "Carlo Cabanilla / Carsten Pfeffer",
    # copyright
    "Carlo Cabanilla / Carsten Pfeffer",
    # date
    "2014 / 2022",
    # menupath
    "<Image>/File/Export/Export to Spine",
    # imagetypes
    "*",
    # params
    [
        (gimpfu.PF_ADJUSTMENT, "compression", "PNG Compression level:", 9, (0, 9, 1)),
        (gimpfu.PF_DIRNAME, "dir", "Directory", os.getcwd()),
        (gimpfu.PF_TOGGLE, "ignore_hidden_layers", "Ignore hidden layers", 0),
    ],
    # results
    [],
    # function
    spine_export
)

gimpfu.main()
