# Photoshop to Spine

## Installation

* Right click this link and choose Save As: [PhotoshopToSpine.jsx](https://github.com/EsotericSoftware/spine-scripts/raw/master/photoshop/PhotoshopToSpine.jsx)
* Run the `PhotoshopToSpine.jsx` script file that was saved by choosing `File` > `Scripts` > `Browse` in Photoshop.

## Basic usage

![](http://n4te.com/x/266-tT4Y.png)

* `Ignore hidden layers` Hidden groups and layers are not output.
* `Ignore background layer` The background layer is not output.
* `Write template image` An image containing the currently visible layers is created for use as a template for positioning in Spine.
* `Scale` Scales the layers before writing the image files. This is useful when using higher resolution art in Photoshop than you want to use in Spine.
* `Padding` The number of pixels around each image. This can avoid aliasing artifacts for opaque pixels along the image edge.
* `Images output path` The folder where the images files will be written.
* `JSON output path` If ending in `.json`, the JSON file that will be  written. Otherwise, the folder where the JSON file will be written, using the name of the PSD file.

## Origin

The Photoshop ruler origin corresponds to 0,0 in Spine. Set the ruler origin to position the images in Spine relative to 0,0.

## Tags

Tags in square brackets can be used in layer and group names to customize the output. The tags can be anywhere in the name, for example `head [slot]` or `[slot] head`.

*Group names:*
* `[slot]`  Layers in the group are placed in a slot, named after the group.
* `[skin]` Layers in the group are placed in a skin, named after the group. Skin images are output in a subfolder for the skin.
* `[merge]` Layers in the group are merged and a single image is output, named after the group.
* `[folder]` Layers in the group will be output in a subfolder. Folder groups can be nested.
* `[ignore]` Layers in the group and any child groups will not be output.

*Layer names:*
* `[ignore]` The layer will not be output.
