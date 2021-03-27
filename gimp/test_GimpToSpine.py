#!/usr/bin/env python
'''
Exports layers to images and outputs a Spine JSON file.
http://esotericsoftware.com/spine-json-format

To install, place this file in: *install*/lib/gimp/*version*/plug-ins/
Where *install* is the GIMP installation folder and *version* is the GIMP version.

To run, in GIMP choose: File -> Export to Spine

Original hosting location:
https://github.com/clofresh/gimp-spine
'''

from GimpToSpine import spine_export
from gimp import Layer, GroupLayer
from typing import List


class Image():
    layers: List[Layer] = []
    width = 1920
    height = 1080
    base_type = None

    def remove_layer(a, b):
        pass

    def append(self, layer):
        self.layers.append(layer)


def test_spine_export_empty():

    expected = {
        'bones': [{'name': 'root'}],
        'slots': [],
        'skins': {'default': {}},
        'animations': {},
    }

    img = Image()

    result = spine_export(img, None, None, "", None)
    assert(result == expected)


def test_spine_export_ignored():

    expected = {
        'bones': [{'name': 'root'}],
        'slots': [],
        'skins': {'default': {}},
        'animations': {},
    }

    img = Image()
    img.layers = [Layer("[ignore]name"), ]

    result = spine_export(img, None, None, "", None)
    assert(result == expected)


def test_spine_export_one_layer():

    expected = {
        'bones': [{'name': 'root'}],
        'slots': [{'attachment': 'name', 'bone': 'root', 'name': 'name'}],
        'skins': {'default': {'name': {'name': {'height': 1080, 'rotation': 0, 'width': 1920, 'x': 0, 'y': 540}}}},
        'animations': {},
    }

    img = Image()
    img.layers = [Layer("name"), ]

    result = spine_export(img, None, None, "", None)
    assert(result == expected)


def test_spine_export_tree_layers():

    expected = {
        'bones': [{'name': 'root'}],
        'slots': [{'attachment': 'name3', 'bone': 'root', 'name': 'name3'},
                  {'attachment': 'name2', 'bone': 'root', 'name': 'name2'},
                  {'attachment': 'name1', 'bone': 'root', 'name': 'name1'}],
        'skins': {'default': {'name1': {'name1': {'height': 1080, 'rotation': 0, 'width': 1920, 'x': 0, 'y': 540}},
                              'name2': {'name2': {'height': 1080, 'rotation': 0, 'width': 1920, 'x': 0, 'y': 540}},
                              'name3': {'name3': {'height': 1080, 'rotation': 0, 'width': 1920, 'x': 0, 'y': 540}}}},
        'animations': {},
    }

    img = Image()
    img.layers = [Layer("name1"), Layer("name2"), Layer("name3"), ]

    result = spine_export(img, None, None, "", None)
    assert(result == expected)


def test_spine_export_merge():

    img = Image()
    group1 = GroupLayer("[merge]name1", image=img)
    group1.layers = [Layer("name2", group1), Layer("name3", group1), ]
    img.layers = [group1]

    img2 = Image()
    img2.layers = [Layer("name1")]

    result = spine_export(img, None, None, "", None)
    expected = spine_export(img2, None, None, "", None)
    assert(result == expected)


def test_spine_export_merge_without_childs():

    img = Image()
    group1 = GroupLayer("[merge]name1", image=img)
    group1.layers = [Layer("name2", group1), Layer("name3", group1), ]
    group2 = GroupLayer("[merge]name4", image=img)
    img.layers = [group1, group2]

    img2 = Image()
    img2.layers = [Layer("name1"), Layer("name4")]

    result = spine_export(img, None, None, "", None)
    expected = spine_export(img2, None, None, "", None)
    assert(result == expected)


def test_spine_export_skin():

    expected = {
        'bones': [{'name': 'root'}],
        'slots': [{'attachment': 'skin1', 'bone': 'root', 'name': 'name2'}],
        'skins': {'skin1': {'name2': {'name2': {'height': 1080, 'rotation': 0, 'width': 1920, 'x': 0, 'y': 540}}}},
        'animations': {},
    }
    img = Image()
    group = GroupLayer("[skin]skin1", image=img)
    group.layers = [Layer("name2", group), ]
    img.layers = [group]

    result = spine_export(img, None, None, "", None)
    assert(result == expected)
