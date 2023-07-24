# Inkscape to Spine

## Installation

1. To download, right-click each of these files and choose `Save As`:
   - [objects_to_spine.inx](https://raw.githubusercontent.com/EsotericSoftware/spine-scripts/master/inkscape/objects_to_spine.inx)
   - [objects_to_spine.py](https://raw.githubusercontent.com/EsotericSoftware/spine-scripts/master/inkscape/objects_to_spine.py)
2. Move the files to the Inkscape extensions directory (eg `$HOME/.config/inkscape/extensions`).
  To find the directory, open the preferences dialog - `Edit > Preferences`, 
  navigate to the `System` tab, and look for the `User extensions` field.
3. Restart Inkscape.

_The scripts are tested and developed for Inkscape `v1.2.2`._
_Compatibility with the previous Inkscape versions is not guaranteed._

## Usage

After installation, choose `Spine` under the `Extensions` menu.

### Spine Export - Objects
Writes individual SVG objects as PNG images and creates a JSON file to bring the images into Spine 
with the same positions and draw order they had in Inkscape.
Read [Spine JSON import guide](http://esotericsoftware.com/spine-import) for details.

The center of the Inkscape document/canvas corresponds to 0,0 in Spine (unless **"Center content"** is checked). 

The script has two modes:
- **Selected Objects** - Export only the selected SVG objects (including layers, groups, and any other SVG nodes) as individual images.
- **Visible Layers** - Export each visible **leaf** layer as an image.

The Spine JSON file will be generated in the output directory and images will be placed under the `./images` directory within it.

An output image name comes from the label of the corresponding SVG node (`inkscape:label` attribute or `id` if the former is not available). 
That's exactly the name you see in the "Layers and Objects" window (access it from the main menu: `Objects > Layers and Objects...`).

The **"Image prefix"** field allows for further sub-dir structure for the output images. 
For example, the `characters/dog/` value would make the exporter place all the images under 
`<output_directory>/images/characters/dog/*.png`

The **"Compact names"** switch, allows slots and attachments to have short names.
When enabled, the image attachments would have their fully qualified image path defined in the "path" property.

If **"Center content"** is enabled, the output composition will be centered in the Spine project.

_NOTE: The layer tags (in square brackets), as you may know them from the other Spine export scripts, are not supported at the moment._
_The script exports a flat dimensional skeleton. All the slots belong to the "root" bone, and there's no multi-attach slot support)._

Know issues:
- A text element (`svg:text`) has the wrong position in the exported Spine JSON.
  As a workaround wrap a text into a group (`svg:group`)
  or turn the text object into a path (`Path > Object to Path`).

### Spine Export - Paths
A Spine JSON file containing the Inkscape paths will be generated.

> `paths_to_spine` script is out of date (not compatbile with Inkscape `v1.2.2`) and requires maintenance.
