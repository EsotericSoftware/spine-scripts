# GIMP to Spine

## Installation

* To download, right click [GimpToSpine.py](https://github.com/EsotericSoftware/spine-scripts/raw/master/gimp/GimpToSpine.py) and choose `Save As`.
* GIMP must be installed with Python plugin support.

![](http://n4te.com/x/253-xQ56.png)
* If you don't have a `Filters` > `Python-Fu` menu, you don't have Python plugin support and will need to reinstall GIMP.

![](http://n4te.com/x/259-9Oyk.png)
* Find your plugin directories by choosing `Edit` > `Preferences` > `Folders` > `Plug-ins`.

![](http://n4te.com/x/262-Ht5T.png)
* Choose any plugin directory which has a green circle when selected and move the `GimpToSpine.py` script file to that directory.
* Restart GIMP.

## Usage

After installation, choose `Export to Spine` under the `File` menu.

![](http://n4te.com/x/255-qhgh.png)

It can be helpful to create a Gimp Keyboard Shortcut that runs the script. A function key can be specified for the action, allowing the script to be run with a single key press.
A new Keyboard Shortcut can be set under the `Edit` menu. Just search for Spine in the Keyboard Shortcut window.

## Tags

Tags in square brackets can be used in layer and group names to customize the output. The tags can be anywhere in the name.

**Group and layer names:**
* `[ignore]` Layers, groups, and any child groups will not be output.
