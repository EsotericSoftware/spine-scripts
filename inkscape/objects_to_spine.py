#!/usr/bin/env python
# coding=utf-8
"""
Spine export for Inkscape

Exports each of [selected objects/visible layers] in the current document to an individual PNG file
and generates a JSON file for Spine import.
https://esotericsoftware.com/spine-json-format

Changelog:
v1.0 @metaphore
    - The old "InkscapeToSpine" script code was updated to Inkex 1.2.2 and optimized.
    - Dropped support for DPI param. We stick to the "px" units of the document.
    - Dropped support for existing Skeleton JSON merge from the original script.
    - Option to choose between export from "visible layers" and "selected objects".
    - Support for name prefix and sub-dir structure of each individual image.
    - Support for "compact names" for slots and attachments (place image paths under the "path" attachment property).
    - Option to center the content.
"""

import os

import inkex
import json

from inkex import BaseElement
from inkex.command import inkscape
from inkex.utils import debug, AbortExtension

INKSCAPE_LABEL = "{%s}label" % (inkex.NSS["inkscape"])


class SpineExporter(inkex.EffectExtension):

    mode_selected_objects = "selected_objects"
    mode_visible_layers = "visible_layers"

    def add_arguments(self, pars):
        pars.add_argument("--tab")
        pars.add_argument(
            "--export-mode",
            action="store",
            type=str,
            dest="export_mode",
            default=self.mode_selected_objects,
            help="Export mode (supported options: \"%s\" or \"%s\")" % (self.mode_selected_objects, self.mode_visible_layers)
        )
        pars.add_argument(
            "--outdir",
            action="store",
            type=str,
            dest="outdir",
            default=os.path.expanduser("~"),
            help="Path to the export directory",
        )
        pars.add_argument(
            "--image-prefix",
            action="store",
            type=str,
            dest="image_prefix",
            default=None,
            help="Prefix to be added to every exported image",
        )
        pars.add_argument(
            "--skeleton-name",
            action="store",
            type=str,
            dest="skel_name",
            default=None,
            help="Name of the exported skeleton",
        )
        pars.add_argument(
            "--json",
            type=inkex.Boolean,
            dest="create_json",
            help="Create a Spine JSON file",
        )
        pars.add_argument(
            "--pretty-print",
            type=inkex.Boolean,
            dest="pretty",
            help="Pretty-print the JSON file",
        )
        pars.add_argument(
            "--center-content",
            type=inkex.Boolean,
            dest="center_content",
            help="Center exported content at zero point",
        )
        pars.add_argument(
            "--compact-names",
            type=inkex.Boolean,
            dest="compact_names",
            help="Slots and attachments will be shortened",
        )

    # Prevent the original document modification.
    def has_changed(self, ret):
        return False

    def effect(self):
        # Delete all the invisible nodes in the document.
        # This is required, due to the node's rendering clips off the hidden sub-nodes.
        # But the Inkex's bounding box still includes the hidden sub-nodes.
        self.delete_invisible_children(self.svg)

        export_mode = self.options.export_mode
        
        if export_mode == self.mode_selected_objects:
            nodes = self.collect_selected_nodes()
            self.export_nodes(nodes)

        elif export_mode == self.mode_visible_layers:
            nodes = self.collect_layers()
            self.export_nodes(nodes)

        else:
            raise NotImplementedError("Unexpected export mode: " + export_mode)

    def collect_layers(self) -> list[BaseElement]:
        xpath = "./svg:g[@inkscape:groupmode='layer']"

        def get_layers(layer: BaseElement) -> list[BaseElement]:
            ret = []
            sublayers = layer.xpath(xpath, namespaces=inkex.NSS)
            if sublayers:
                for sublayer in sublayers:
                    ret += get_layers(sublayer)

            if len(ret) == 0:
                # No sub-layers found, just add itself.
                ret.append(layer)

            return ret

        doc_root: BaseElement = self.svg
        layers = get_layers(doc_root)
        if layers[0] == doc_root:
            raise AbortExtension("No layers found in the document")
        return layers

    def collect_selected_nodes(self) -> list[BaseElement]:
        selected_nodes = self.svg.selection.rendering_order()
        # Filter out invisible objects.
        selected_nodes = list(filter(lambda node: not self.is_hidden(node), selected_nodes))
        if len(selected_nodes) == 0:
            raise AbortExtension("Nothing is selected.")
        return selected_nodes

    def export_nodes(self, nodes: list[BaseElement]):
        image_prefix = self.options.image_prefix.replace("\\", "/")

        output_dir = os.path.expanduser(self.options.outdir)
        images_dir = os.path.join(output_dir, "images")
        if not os.path.isdir(images_dir):
            os.makedirs(images_dir)

        skel_struct = {
            "skeleton": {"images": "images"},
            "bones": [{"name": "root"}],
            "slots": [],
            "skins": [{"name": "default", "attachments": {}}],
            "animations": {"animation": {}},
        }

        for node in nodes:

            bbox = self.get_bounding_box(node)
            # Object may have no bounding box in case it's content is empty or invisible.
            if bbox is None:
                continue

            # Inkscape uses the "inkscape:label" attribute to display the name
            # (the one you see and edit in the "Layers and Objects" window).
            # If the label is missing, fall back to the mandatory "id" attribute instead.
            node_name = node.label
            if node_name is None or str(node_name).isspace():
                node_name = node.get_id()

            full_name = node_name
            if image_prefix and not image_prefix.isspace():
                full_name = image_prefix + full_name

            image_file = os.path.join(images_dir, "%s.png" % full_name)
            image_file_parent = os.path.dirname(image_file)
            if not os.path.exists(image_file_parent):
                os.makedirs(image_file_parent)

            # Render the object.
            inkex.command.inkscape(
                self.options.input_file,
                **{
                    "export-filename": image_file,
                    "export-id": node.get_id(),
                    "export-id-only": None,
                    "export-overwrite": None,
                    "export-text-to-path": None, # Do we need this?
                }
            )

            attach_name = full_name
            attach_path = None
            if self.options.compact_names:
                # Trim dirs from the full file name.
                attach_name = os.path.splitext(os.path.basename(image_file))[0]
                # Remove the ".png" extension.
                attach_path = os.path.relpath(image_file, images_dir)[:-4].replace("\\", "/")
            slot_name = attach_name

            self.register_image_attachment(skel_struct, slot_name, attach_name, attach_path, bbox)

        # Create Skeleton JSON file.
        if self.options.create_json:
            if self.options.center_content:
                self.center_skel_content(skel_struct)

            # If user hasn't provided the skeleton name, use the document name instead.
            skel_name = self.options.skel_name
            if not skel_name or skel_name.isspace():
                skel_name = self.get_document_name()
            path = os.path.join(output_dir, "%s.json" % skel_name)
            if self.options.pretty:
                args = {"separators": (",", ": "), "indent": 4}
            else:
                args = {"separators": (",", ":")}

            with open(path, "w") as f:
                json.dump(skel_struct, f, **args)

    def get_document_name(self) -> str:
        doc_root = self.svg
        doc_name = doc_root.xpath("//@sodipodi:docname", namespaces=inkex.NSS)
        if doc_name:
            return doc_name[0].replace(".svg", "")
        return doc_root.attrib["id"]

    def get_canvas_size(self) -> tuple[float, float]:
        width = self.svg.viewport_width
        height = self.svg.viewport_height
        return width, height

    def coords_to_spine(self, left, top, width, height) -> tuple[float, float, float, float]:
        global_width, global_height = self.get_canvas_size()
        bottom = height + top
        x = 0.5 * width - (global_width * 0.5) + left
        y = (global_height - top - bottom) / 2
        return x, y, width, height

    def register_image_attachment(self, skel_struct, slot_name, attach_name, image_path, bbox):
        """
        Add image attachment to the default skin and place it under the specified slot.
        """
        x, y, width, height = self.coords_to_spine(*bbox)

        # Find existing or create a new slot.
        slot = self.find_named_elem(skel_struct["slots"], slot_name)
        if not slot:
            slot = slot = {
                "name": slot_name,
                "attachment": attach_name,
                "bone": "root",
            }
            skel_struct["slots"].append(slot)

        # Compose attachment data.
        attach_props = {
            "x": x,
            "y": y,
            "width": width,
            "height": height,
        }
        if image_path and not image_path.isspace():
            attach_props["path"] = image_path

        # Insert the attachment under the default skin.
        skin_attachments = skel_struct["skins"][0]["attachments"]
        skin_slot_record = None
        if slot_name in skin_attachments:
            skin_slot_record = skin_attachments[slot_name]
        else:
            skin_slot_record = {}
            skin_attachments[slot_name] = skin_slot_record
        skin_slot_record[attach_name] = attach_props

    @staticmethod
    def is_hidden(node: BaseElement) -> bool:
        style = inkex.Style.parse_str(node.attrib.get("style", ""))
        return style.get("display") == "none"

    @staticmethod
    def delete_invisible_children(node: BaseElement):
        children = node.getchildren().copy()
        for child_node in children:
            if SpineExporter.is_hidden(child_node):
                # debug("Invisible node removed: " + str(node.get_id()))
                node.remove(child_node)
            else:
                SpineExporter.delete_invisible_children(child_node)

    # @staticmethod
    def get_bounding_box(self, node: BaseElement) -> tuple[float, float, float, float] | None:
        transform = None
        parent = node.getparent()
        if parent is not None:
            transform = parent.composed_transform()
        bounding_box = node.bounding_box(transform)

        if bounding_box is None:
            return None

        x = round(self.svg.uutounit(bounding_box.x.minimum))
        y = round(self.svg.uutounit(bounding_box.y.minimum))
        width = round(self.svg.uutounit(bounding_box.width))
        height = round(self.svg.uutounit(bounding_box.height))
        return x, y, width, height

    @staticmethod
    def find_named_elem(array: list, name):
        """
        Find an element with a matching "name" property in the array.
        This is suitable for searching for a specific bone or slot in the Skeleton structure.
        """
        for obj in array:
            if obj["name"] == name:
                return obj
        return None

    @staticmethod
    def center_skel_content(skel_struct):
        # For now as we keep things simple, the image attachment translation is not a big deal,
        # but later if we add support for other Spine types (e.g. paths or meshes)
        # we would need to come up with a much more sophisticated approach for centering the content.

        slot_list = skel_struct["skins"][0]["attachments"]

        # Find the composition bounding box.
        x_min = float("+inf")
        x_max = float("-inf")
        y_min = float("+inf")
        y_max = float("-inf")

        for slot in slot_list.values():
            # A slot may contain multiple attachments.
            for attach in slot.values():
                center_x = attach.get("x", 0.0)
                center_y = attach.get("y", 0.0)
                half_width = attach.get("width", 0.0) * 0.5
                half_height = attach.get("height", 0.0) * 0.5
                x_min = min(x_min, center_x - half_width)
                x_max = max(x_max, center_x + half_width)
                y_min = min(y_min, center_y - half_height)
                y_max = max(y_max, center_y + half_height)

        bb_center_x = (x_min + x_max) * 0.5
        bb_center_y = (y_min + y_max) * 0.5

        # Shift all attachments.
        for slot in slot_list.values():
            for attach in slot.values():
                attach["x"] = attach.get("x", 0.0) - bb_center_x
                attach["y"] = attach.get("y", 0.0) - bb_center_y


if __name__ == "__main__":
    SpineExporter().run()
