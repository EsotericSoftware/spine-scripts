# Inkscape to Spine

## Installation

* To download, right click each of these files and choose `Save As`:
  * [InkscapeToSpine.inx](https://github.com/EsotericSoftware/spine-scripts/raw/master/inkscape/InkscapeToSpine.inx)
  * [InkscapeToSpine.py](https://github.com/EsotericSoftware/spine-scripts/raw/master/inkscape/InkscapeToSpine.py)
  * [PathsToSpine.inx](https://github.com/EsotericSoftware/spine-scripts/raw/master/inkscape/PathsToSpine.inx)
  * [PathsToSpine.py](https://github.com/EsotericSoftware/spine-scripts/raw/master/inkscape/PathsToSpine.py)
* Move the files to the Inkscape extensions directory (eg `$HOME/.config/inkscape/extensions`).
* Restart Inkscape.

## Usage

After installation, choose `Spine` under the `Extensions` menu.

For the `Spine Export` option, for each leaf layer, an image will be written to the specified output directory. By default, a Spine JSON file will be generated in the output directory and images will be output to the `./images` directory within it.

For the `Spine Export - Paths` option, a Spine JSON file containing the Inkscape paths will be generated.

The Spine JSON files can be [imported](http://esotericsoftware.com/spine-import) into Spine.
