# Illustrator to Spine

This script supports the latest version of Illustrator CC and all older versions of Photoshop back to CS2.

Please note that Adobe has made [CS2 available for download](https://helpx.adobe.com/creative-suite/kb/cs2-product-downloads.html?promoid=19SCDRQK), though they ask that only those who legitimately purchased CS2 use it.

## Download

To download, right click [IllustratorToSpine.jsx](https://github.com/EsotericSoftware/spine-scripts/raw/master/illustrator/IllustratorToSpine.jsx) and choose `Save As`.

## Usage

Run the `IllustratorToSpine.jsx` script file by choosing `File` > `Scripts` > `Browse` in Illustrator.

![](http://n4te.com/x/4104-lCih.png)

Dragging the script and dropping it on the illustrator window will also run the script.

* `Output directory` The folder where the images files will be written.
* `PNG Scale` Scales the layers before writing the image files. This is useful when using higher resolution art in Illustrator than you want to use in Spine.
* `Ignore hidden layers` Hidden groups and layers are not output.
* `Write template image` An image containing the currently visible layers is created for use as a template for positioning in Spine.
* `Clear output directory` Clears the images directory.
* `Write Spine JSON` When unchecked, the script will only output the images.

**Layer names:**
* `[-]` To ignore a layer explicitly, add the `[-]` prefix to the layer name. The layer will not be output.
