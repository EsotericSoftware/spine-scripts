# Photoshop to Spine

This script supports the latest version of Photoshop CC and all older versions of Photoshop back to CS2.

Please note that Adobe has made [CS2 available for download](https://helpx.adobe.com/creative-suite/kb/cs2-product-downloads.html?promoid=19SCDRQK), though they ask that only those who legitimately purchased CS2 use it.

## Download

Right click this link: [PhotoshopToSpine.jsx](https://github.com/EsotericSoftware/spine-scripts/raw/master/photoshop/PhotoshopToSpine.jsx) (not the link above) and choose `Save Link As` to save the script file. Make sure the extension of the file you are saving is `.jsx` and that you aren't mistakenly saving the web page instead.

To see the Spine logo on the dialog, you may optionally right click [logo.png](https://github.com/EsotericSoftware/spine-scripts/raw/master/photoshop/logo.png) and choose `Save As` to save the logo image in the same folder as the script file.

## Install

Navigate to the Photoshop installation folder, then choose the folder `Presents`, then `Scripts`. On Windows the path is likely similar to this:
```
C:\Program Files\Adobe\Adobe Photoshop CC 2019\Presets\Scripts
```

Copy the files `PhotoshopToSpine.jsx` (and optionally `logo.png`) inside the `Scripts` folder, then restart Photoshop.

## Tutorial video

[![](https://esotericsoftware.com/img/photoshop-yt-video-thumbnail.png)](https://youtu.be/p7yZET00GeE)

## Usage
The script can be run by choosing `File` > `Scripts` > `PhotoshopToSpine` in Photoshop.

If you didn't copy the files in the Photoshop directory, the script can also be run by choosing `File` > `Scripts` > `Browse` in Photoshop.

The script can also be run by dragging the file to Photoshop window's menu bar or toolbar if you're using Photoshop v19 or earlier.

It can be helpful to create a Photoshop action that runs the script. A function key can be specified for the action, allowing the script to be run with a single key press.

![](http://n4te.com/x/6818-OdSW.png)

* `Ignore hidden layers` Hidden groups and layers are not output.
* `Ignore background layer` The background layer is not output.
* `Trim whitespace` When checked, whitespace around the edges of each layer is removed. When unchecked, all images are the size of the PSD.
* `Write Spine JSON` A JSON file is written that can be imported into Spine.
* `Write template image` An image containing the currently visible layers is created for use as a template for positioning in Spine.
* `Scale` Scales the layers before writing the image files. This is useful when using higher resolution art in Photoshop than you want to use in Spine.
* `Padding` The number of pixels around each image. This can avoid aliasing artifacts for opaque pixels along the image edge.
* `Images output path` The folder where the images files will be written.
* `JSON output path` If ending in `.json`, the JSON file that will be  written. Otherwise, the folder where the JSON file will be written, using the name of the PSD file.

## Origin

The Photoshop ruler origin corresponds to 0,0 in Spine, allowing you to constrol the position of your skeleton in Spine.

## Tags

Tags in square brackets can be used in layer and group names to customize the output. The tags can be anywhere in the name, for example `head [slot]` or `[slot] head`.

**Group names:**
* `[bone]`  Slot and bone layers in the group are placed under a bone, named after the group. The bone is created at the center of a visible attachment.
* `[slot]`  Layers in the group are placed in a slot, named after the group.
* `[skin]` Layers in the group are placed in a skin, named after the group. Skin images are output in a subfolder for the skin.
* `[merge]` Layers in the group are merged and a single image is output, named after the group.
* `[folder]` Layers in the group will be output in a subfolder. Folder groups can be nested.
* `[ignore]` Layers in the group and any child groups will not be output.

**Layer names:**
* `[ignore]` The layer will not be output.
* `[path:name]` Specifies the image file name, which can be different from the attachment name. Whitespace trimming is required. Can be used on a group with `[merge]`.

## Blending modes

The script will recognize the following blending modes applied to a folder or layer. The slot in Spine will have the corresponding blending mode.

* `Normal` corresponds to the `Normal` blending mode in Spine.
* `Multiply` corresponds to the `Multiply` blending mode in Spine.
* `Screen` corresponds to the `Screen` blending mode in Spine.
* `Linear Dodge` corresponds to the `Additive` blending mode in Spine.

## Adjustment layers

Adjustment layers can be used in Photoshop and are automatically applied to the generated images, without having to apply or merge them to each layer below them.
