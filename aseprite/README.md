### Update - This has been added to the official Spine Scripts repository:

 https://github.com/EsotericSoftware/spine-scripts

___

# aseprite-to-spine 

## Lua Script for importing Aseprite projects into Spine

## v1.1

### Installation

1. Open Aseprite
2. Go to **File > Scripts > Open Scripts Folder**
3. Drag the included ```Prepare-For-Spine.lua``` file to this directory
4. In Aseprite, click **File > Scripts > Rescan Scripts Folder**

After following these steps, the "Prepare-For-Spine" script should show up in the list.

### Usage 

1. Create your sprite just like you would in Photoshop.  Each "bone" should be on its own layer.  
2. Keep in mind that layer "groups" are ignored when exporting.  
3. When you're ready to bring your art into Spine, save your project and run the ```Prepare-For-Spine``` script.  This will create a .json file as well as an "images" folder in the directory your aseprite project is saved in. 
4. If you get a dialogue requesting permissions for the script, click "give full trust" (it's just requesting permission for the export script to save files).
5. Open Spine and create a new project
6. Click the Spine Logo in the top left to open the file menu, and click **Import Data**.
7. Set up your Skeleton and start creating animations!

### Known Issues 
* Hiding a group of layers will not exclude it from the export.  Each layer needs to be shown or hidden individually (group visibility is ignored)
* Not as many options as the Photshop script.  Maybe I'll add these in the future but honestly i've never used any of them so we will see.

### Version History

#### v1.1

- Changed to export images trimmed to the size of their non-transparent pixels.
- Hidden layers are not included in the json file for importing into Spine.

#### v1.0

Initial Release
