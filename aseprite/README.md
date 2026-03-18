### Update - This has been added to the official Spine Scripts repository

 <https://github.com/EsotericSoftware/spine-scripts>

___

[中文版 文档](README_cn.md)

# aseprite-to-spine

## Lua Script for importing Aseprite projects into Spine

## v1.2

### Installation

1. Open Aseprite
2. Go to **File > Scripts > Open Scripts Folder**
3. Drag the included ```Prepare-For-Spine.lua``` file to this directory
4. In Aseprite, click **File > Scripts > Rescan Scripts Folder**

After following these steps, the "Prepare-For-Spine" script should show up in the list.

### Usage

#### 「Aseprite Export」

1. Create your sprite just like you would in Photoshop.  Each "bone" should be on its own layer.
2. When you're ready to bring your art into Spine, save your project and run the ```Prepare-For-Spine``` script.  You can find it under **File > Scripts > Prepare-For-Spine**.
3. Configure the export options as needed, then click the "Export" button.  By default, the script will export a JSON file and a folder of PNG images to the same directory as your Aseprite project file.
   * The default configuration is suitable for most users, so you can simply click the Export button to use the default settings.
4. If you get a dialogue requesting permissions for the script, click "give full trust" (it's just requesting permission for the export script to save files).

![alt text](Images/image-1.png)

* Reset Config Button: Resets all options to their default values.
  * This will also clear any cached settings, so the next time you open the options dialog it will be restored to the default values.
* Origin (X/Y): Sets the coordinate origin for the exported images.
  * This coordinate origin will align with the coordinate origin in Spine, affecting the default position of the images when imported into Spine.
  * The origin coordinates are normalized to the range [0,1], where (0,0) represents the bottom-left corner of the image and (1,1) represents the top-right corner.
  * There are also quick preset buttons for common origin configurations (Center, Bottom-Center, Bottom-Left, Top-Left) that will automatically set the X and Y values accordingly.
* Round Coordinates to Integer: When enabled, the script will round all coordinate values to the nearest integer, dropping any decimal part.
  * This may cause pixel misalignment. For example, if the origin is set to center and the image has odd pixel dimensions, the true center lies at the center of the middle pixel rather than on an edge. Forcing integer coordinates can therefore introduce a half-pixel offset.
  * Pixel art usually requires perfect pixel alignment, so this option is not recommended unless you have a specific need.
* Output Path: Allows you to specify a custom output path for the exported JSON file.
  * By default, it will be saved in the same directory as your Aseprite project file.
  * You can type a path directly into the text field, or click the button below to open a file picker dialog. After selecting a location, the path is filled into the text field automatically.
* Ignore Group Visibility: When enabled, the script will ignore the visibility of groups during export.
  * This only considers each layer's own visibility and ignores the visibility of its parent group. That means a layer can still be exported even if its group is hidden, as long as the layer itself is visible.
* Clear Old Images: When enabled, the script will automatically delete any previously exported images in the output directory before exporting new ones.
  * This helps to prevent confusion and clutter from old files that are no longer relevant to the current export.
* Export Button: Starts the export process with the configured options.
  * After export completes, click the [Open File Folder] button to open the directory containing the exported files.
* Cancel Button: Closes the options dialog without exporting.

#### 「Spine Import」

1. Open Spine and create a new project.
2. Click the Spine Logo in the top left to open the file menu, and click **[Import Data]**.
3. Set up your Skeleton and start creating animations!

![alt text](Images/image-2.png)

* Import: Import source. Here, use the default selected option: JSON or binary file.
  * JSON or binary file: Import from a JSON file or a binary file.
  * Folder: Import from a folder.
* File: Select the JSON file or folder to import.
  * Click the folder icon button on the right to open the file picker dialog, then choose the JSON file to import or a folder that contains a JSON file.
* Scale: Import scale. The default value is 1.0, which means no scaling.
  * Adjust this value as needed. For example, set it to 0.5 to import assets at half size, or set it to 2.0 to import assets at double size.
* New Project: If checked, a new project will be created during import. Otherwise, imported assets will be added to the currently open project.
  * If you already created an empty new project, you do not need to check this option and can import directly.
* Create a new skeleton: If checked, a new skeleton will be created during import.
  * If you already created an empty new project, you do not need to check this option and can import directly.
* Import into an existing skeleton: If checked, imported assets will be added to an existing skeleton.
  * Replace existing attachments: If checked, attachments with the same name in the existing skeleton will be replaced during import.
* Import button: Start importing with the current configuration.
* Cancel button: Close the dialog and cancel the import.

### Known Issues

#### v1.2

* Opening the exported file location currently relies on `os` library APIs and may cause a brief UI stall (a few seconds).
* Deleting old `images` files also relies on `os` library APIs and may cause a brief UI stall.

#### v1.1

* Hiding a group of layers will not exclude it from the export.  Each layer needs to be shown or hidden individually (group visibility is ignored)
* Not as many options as the Photshop script.  Maybe I'll add these in the future but honestly i've never used any of them so we will see.

### Version History

#### v1.2

* Enable Effective Group Visibility During Export
  * Propagated group visibility downward during recursive traversal.
  * Combined layer collection and effective-visibility recording into a single recursive pass to improve efficiency.

* Added a new UI options panel
  * Toggle for Ignore Group Visibility.
  * Export path setting for the output JSON file.

* Added updates to the UI options panel
  * Toggle for Clear Old Images before export.
  * Simplified output path selection workflow.
  * Improved overall UI layout and spacing.

* Added updates to the UI options panel
  * Coordinate origin is now configurable (X/Y), with range support for [0,1].
  * Added a toggle to keep coordinate values as integers (drop decimal part).
  * Added quick access to open the exported file location after export completion.

* Added export workflow and coordinate UI improvements
  * Added origin coordinate preset buttons for quick setup (Center, Bottom-Center, Bottom-Left, Top-Left).
  * Added real-time clamping for origin coordinate inputs, limiting values to the [0,1] range.
  * Added export completion dialog warnings that list any file paths that failed to write during export.

* Added persistent UI configuration cache
  * Added configuration caching for all export options, so settings are restored automatically on next launch.
  * Added a Reset Config button to restore default values and clear cached settings.

#### v1.1

* Changed to export images trimmed to the size of their non-transparent pixels.
* Hidden layers are not included in the json file for importing into Spine.

#### v1.0

Initial Release
