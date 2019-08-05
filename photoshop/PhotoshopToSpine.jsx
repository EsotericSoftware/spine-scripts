#target photoshop
app.bringToFront();

// This script exports Adobe Photoshop layers as individual PNGs. It also
// writes a JSON file which can be imported into Spine where the images
// will be displayed in the same positions and draw order.

// Copyright (c) 2012-2017, Esoteric Software
// All rights reserved.
// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
//     * Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
//     * Neither the name of Esoteric Software nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

var scriptVersion = 4.1; // This is incremented every time the script is modified, so you know if you have the latest.

var cs2 = parseInt(app.version) < 10;

var originalDoc;
try {
	originalDoc = app.activeDocument;
} catch (ignored) {}

var defaultSettings = {
	ignoreHiddenLayers: false,
	ignoreBackground: true,
	writeTemplate: false,
	writeJson: true,
	trimWhitespace: true,
	scale: 1,
	padding: 1,
	imagesDir: "./images/",
	jsonPath: "./",
};
var settings = loadSettings();
showSettingsDialog();

var progress, cancel, errors;
function run () {
	errors = [];
	showProgressDialog();

	// Output dirs.
	var jsonFile = new File(jsonPath(settings.jsonPath));
	jsonFile.parent.create();
	var imagesDir = absolutePath(settings.imagesDir);
	var imagesFolder = new Folder(imagesDir);
	imagesFolder.create();

	// Get ruler origin.
	var action = new ActionReference();
	action.putEnumerated(cID("Dcmn"), cID("Ordn"), cID("Trgt"));
	var result = executeActionGet(action);
	var xOffSet = result.getInteger(sID("rulerOriginH")) >> 16;
	var yOffSet = result.getInteger(sID("rulerOriginV")) >> 16;

	activeDocument.duplicate();
	deselectLayers();

	try {
		convertToRGB();
	} catch (ignored) {}
	if (app.activeDocument.mode != DocumentMode.RGB) {
		alert("Please change the image mode to RGB color.");
		return;
	}

	// Output template image.
	if (settings.writeTemplate) {
		if (settings.scale != 1) {
			storeHistory();
			scaleImage();
		}

		var file = new File(imagesDir + "template.png");
		if (file.exists) file.remove();

		savePNG(file);

		if (settings.scale != 1) restoreHistory();
	}

	if (!settings.jsonPath && !settings.imagesDir) return;

	// Rasterize all layers.
	try {
		executeAction(sID("rasterizeAll"), undefined, DialogModes.NO);
	} catch (ignored) {}

	// Add a history item to prevent layer visibility from changing by the active layer being reset to the top.
	activeDocument.artLayers.add();

	// Collect and hide layers.
	var layers = [];
	collectLayers(activeDocument, layers);
	var layersCount = layers.length;

	// Add a history item to prevent layer visibility from changing by restoreHistory.
	activeDocument.artLayers.add();

	// Store the bones, slot names, and layers for each skin.
	var bones = { _root: { name: "root", x: 0, y: 0, children: [] } };
	var slots = {}, slotsCount = 0;
	var skins = { _default: [] }, skinsCount = 0;
	var totalLayerCount = 0;
	outer:
	for (var i = 0; i < layersCount; i++) {
		if (cancel) return;
		var layer = layers[i];
		if (layer.kind != LayerKind.NORMAL && !isGroup(layer)) continue;

		var name = stripTags(layer.name).replace(/.png$/, "");
		name = name.replace(/[\\\/:"*?<>|]/g, "").replace(/^\.+$/, "").replace(/^__drag$/, ""); // Illegal.
		name = name.replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, ""); // Windows.
		if (!name || name.length > 255) {
			error("Layer name is not a valid attachment name:\n\n" + layer.name);
			continue;
		}
		var folderPath = folders(layer, "");
		layer.attachmentName = folderPath + name;
		layer.attachmentPath = folderPath + findTagValue(layer, "path", name);

		var bone = null;
		var boneLayer = findTagLayer(layer, "bone", null);
		if (boneLayer) {
			var parent = getParentBone(boneLayer, bones);
			var boneName = stripTags(boneLayer.name);
			bone = get(bones, boneName);
			if (bone) {
				if (parent != bone.parent) {
					error("Multiple layers for the \"" + boneName + "\" bone have different parent bones:\n\n"
						+ bone.parent.name + "\n"
						+ parent.name);
					continue;
				}
			} else {
				set(bones, boneName, bone = { name: boneName, parent: parent, children: [] });
				parent.children.push(bone);
			}
			if (layer.wasVisible) {
				bone.x = (layer.bounds[0].as("px")) * settings.scale - settings.padding;
				bone.x += (layer.bounds[2].as("px") - layer.bounds[0].as("px")) * settings.scale / 2 + settings.padding;
				bone.y = (activeDocument.height.as("px") - layer.bounds[1].as("px")) * settings.scale + settings.padding;
				bone.y -= (layer.bounds[3].as("px") - layer.bounds[1].as("px")) * settings.scale / 2 + settings.padding;

				// Make relative to the Photoshop document ruler origin.
				bone.x -= xOffSet * settings.scale;
				bone.y -= (activeDocument.height.as("px") - yOffSet) * settings.scale;
			}
		}

		layer.slotName = findTag(layer, "slot", layer.attachmentName);
		if (!get(slots, layer.slotName)) slotsCount++;
		var slot;
		set(slots, layer.slotName, slot = { bone: bone, attachment: layer.wasVisible ? layer.attachmentName : null });
		if (layer.blendMode == BlendMode.LINEARDODGE)
			slot.blend = "additive";
		else if (layer.blendMode == BlendMode.MULTIPLY)
			slot.blend = "multiply";
		else if (layer.blendMode == BlendMode.SCREEN)
			slot.blend = "screen";

		var skinName = findTag(layer, "skin", "default");
		var skinSlots = get(skins, skinName);
		if (!skinSlots) {
			set(skins, skinName, skinSlots = {});
			skinsCount++;
		}

		var skinLayers = get(skinSlots, layer.slotName);
		if (!skinLayers) set(skinSlots, layer.slotName, skinLayers = []);
		for (var ii = 0, nn = skinLayers.length; ii < nn; ii++) {
			if (skinLayers[ii].attachmentName == layer.attachmentName) {
				error("Multiple layers for the \"" + skinName + "\" skin have the same name:\n\n"
					+ layer.attachmentName
					+ "\n\nRename or use the [path:name] or [ignore] tag for these layers.");
				continue outer;
			}
		}
		skinLayers[skinLayers.length] = layer;
		totalLayerCount++;
	}

	var n = errors.length;
	if (n) {
		var first = errors[0];
		var file;
		if (n > 1) {
			try {
				var all = "";
				for (var i = 0; i < n; i++) {
					if (i > 0) all += "---\n";
					all += errors[i].replace(/\n\n/g, "\n") + "\n";
				}
				file = new File(jsonFile.parent + "/errors.txt");
				file.parent.create();
				file.encoding = "UTF-8";
				file.remove();
				file.open("w", "TEXT");
				file.lineFeed = "\n";
				file.write(all);
				file.close();
				if (n == 2)
					first += "\n\nSee errors.txt for 1 additional error.";
				else
					first += "\n\nSee errors.txt for " + (n - 1) + " additional errors.";
			} catch (e) {
				if (n == 2)
					first += "\n\nUnable to write 1 additional error to errors.text.\n"+e;
				else
					first += "\n\nUnable to write " + (n - 1) + " additional errors to errors.txt.\n"+e;
			}
		}
		alert(first);
		if (file) file.execute();
		return;
	}

	// Output skeleton.
	var json = '{ "skeleton": { "images": "' + imagesDir + '" },\n"bones": [\n';

	// Output bones.
	function outputBone (bone) {
		var json = bone.parent ? ",\n" : "";
		json += '\t{ "name": ' + quote(bone.name);
		var x = bone.x, y = bone.y;
		if (bone.parent) {
			x -= bone.parent.x;
			y -= bone.parent.y;
			json += ', "parent": ' + quote(bone.parent.name);
		}
		if (x) json += ', "x": ' + x;
		if (y) json += ', "y": ' + y;
		json += ' }';
		for (var i = 0, n = bone.children.length; i < n; i++)
			json += outputBone(bone.children[i]);
		return json;
	}
	for (var boneName in bones) {
		if (cancel) return;
		if (!bones.hasOwnProperty(boneName)) continue;
		var bone = bones[boneName];
		if (!bone.parent) json += outputBone(bone);
	}
	json += '\n],\n"slots": [\n';

	// Output slots.
	var slotIndex = 0;
	for (var slotName in slots) {
		if (cancel) return;
		if (!slots.hasOwnProperty(slotName)) continue;
		var slot = slots[slotName];
		slotName = stripName(slotName);
		json += '\t{ "name": ' + quote(slotName) + ', "bone": ' + quote(slot.bone ? slot.bone.name : "root");
		if (slot.attachment) json += ', "attachment": ' + quote(slot.attachment);
		if (slot.blend) json += ', "blend": ' + quote(slot.blend);
		json += ' }';
		slotIndex++;
		json += slotIndex < slotsCount ? ",\n" : "\n";
	}
	json += '],\n"skins": {\n';

	// Output skins.
	var skinIndex = 0, layerCount = 0;
	for (var skinName in skins) {
		if (!skins.hasOwnProperty(skinName)) continue;
		var skinSlots = skins[skinName];
		skinName = stripName(skinName);
		json += '\t"' + skinName + '": {\n';

		var skinSlotIndex = 0, skinSlotsCount = countAssocArray(skinSlots);
		for (var slotName in skinSlots) {
			if (!skinSlots.hasOwnProperty(slotName)) continue;
			var bone = slots[slotName].bone;
			var skinLayers = skinSlots[slotName];
			slotName = stripName(slotName);

			json += '\t\t' + quote(slotName) + ': {\n';

			var skinLayerIndex = 0, skinLayersCount = skinLayers.length;
			for (var i = skinLayersCount - 1; i >= 0; i--) {
				var layer = skinLayers[i];
				layer.visible = true;

				if (cancel) return;
				setProgress(++layerCount / totalLayerCount, trim(layer.name));

				var placeholderName = layer.attachmentName, attachmentName = placeholderName, attachmentPath = layer.attachmentPath;
				if (skinName != "default") {
					attachmentName = skinName + "/" + attachmentName;
					attachmentPath = skinName + "/" + attachmentPath;
				}

				if (isGroup(layer)) {
					activeDocument.activeLayer = layer;
					layer = layer.merge();
				}

				storeHistory();

				var x = 0, y = 0;
				if (settings.trimWhitespace) {
					x = activeDocument.width.as("px") * settings.scale;
					y = activeDocument.height.as("px") * settings.scale;
					if (!layer.isBackgroundLayer) activeDocument.trim(TrimType.TRANSPARENT, false, true, true, false);
					x -= activeDocument.width.as("px") * settings.scale;
					y -= activeDocument.height.as("px") * settings.scale;
					if (!layer.isBackgroundLayer) activeDocument.trim(TrimType.TRANSPARENT, true, false, false, true);
				}
				var width = activeDocument.width.as("px") * settings.scale + settings.padding * 2;
				var height = activeDocument.height.as("px") * settings.scale + settings.padding * 2;

				// Save image.
				if (settings.imagesDir) {
					if (settings.scale != 1) scaleImage();
					if (settings.padding > 0) activeDocument.resizeCanvas(width, height, AnchorPosition.MIDDLECENTER);

					var file = new File(imagesDir + attachmentPath + ".png");
					file.parent.create();
					savePNG(file);
				}

				restoreHistory();
				if (layerCount < totalLayerCount) deleteLayer(layer);

				x += Math.round(width) / 2 - settings.padding;
				y += Math.round(height) / 2 - settings.padding;

				// Make relative to the Photoshop document ruler origin.
				x -= xOffSet * settings.scale;
				y -= (activeDocument.height.as("px") - yOffSet) * settings.scale;

				if (bone) { // Make relative to parent bone.
					x -= bone.x;
					y -= bone.y;
				}

				json += "\t\t\t" + quote(placeholderName) + ': { ';
				if (attachmentName != placeholderName) json += '"name": ' + quote(attachmentName) + ', ';
				if (attachmentName != attachmentPath) json += '"path": ' + quote(attachmentPath) + ', ';
				json += '"x": ' + x + ', "y": ' + y + ', "width": ' + Math.round(width) + ', "height": ' + Math.round(height);

				json += " }" + (++skinLayerIndex < skinLayersCount ? ",\n" : "\n");
			}

			json += "\t\t\}" + (++skinSlotIndex < skinSlotsCount ? ",\n" : "\n");
		}

		json += "\t}" + (++skinIndex <= skinsCount ? ",\n" : "\n");
	}
	json += '},\n"animations": { "animation": {} }\n}';

	activeDocument.close(SaveOptions.DONOTSAVECHANGES);

	// Output JSON file.
	if (settings.writeJson && settings.jsonPath) {
		if (cancel) return;
		jsonFile.encoding = "UTF-8";
		jsonFile.remove();
		jsonFile.open("w", "TEXT");
		jsonFile.lineFeed = "\n";
		jsonFile.write(json);
		jsonFile.close();
	}
}

// Settings dialog:

function showSettingsDialog () {
	if (parseInt(app.version) < 9) {
		alert("Photoshop CS2 or later is required.");
		return;
	}
	if (!originalDoc) {
		alert("Please open a document before running the PhotoshopToSpine script.");
		return;
	}
	try {
		decodeURI(activeDocument.path);
	} catch (e) {
		alert("Please save the document before running the PhotoshopToSpine script.");
		return;
	}

	// Layout.
	var dialog = new Window("dialog", "PhotoshopToSpine v" + scriptVersion), group;
	dialog.alignChildren = "fill";

	try {
		dialog.add("image", undefined, new File(scriptDir() + "logo.png"));
	} catch (ignored) {}

	var settingsGroup = dialog.add("panel", undefined, "Settings");
		settingsGroup.margins = [10,15,10,10];
		settingsGroup.alignChildren = "fill";
		var checkboxGroup = settingsGroup.add("group");
			checkboxGroup.alignChildren = ["left", ""];
			checkboxGroup.orientation = "row";
			group = checkboxGroup.add("group");
				group.orientation = "column";
				group.alignChildren = ["left", ""];
				var ignoreHiddenLayersCheckbox = group.add("checkbox", undefined, " Ignore hidden layers");
				ignoreHiddenLayersCheckbox.value = settings.ignoreHiddenLayers;
				var ignoreBackgroundCheckbox = group.add("checkbox", undefined, " Ignore background layer");
				ignoreBackgroundCheckbox.value = settings.ignoreBackground;
				var trimWhitespaceCheckbox = group.add("checkbox", undefined, " Trim whitespace");
				trimWhitespaceCheckbox.value = settings.trimWhitespace;
			group = checkboxGroup.add("group");
				group.orientation = "column";
				group.alignChildren = ["left", ""];
				group.alignment = ["", "top"];
				var writeJsonCheckbox = group.add("checkbox", undefined, " Write Spine JSON");
				writeJsonCheckbox.value = settings.writeJson;
				var writeTemplateCheckbox = group.add("checkbox", undefined, " Write template image");
				writeTemplateCheckbox.value = settings.writeTemplate;
		var scaleText, paddingText, scaleSlider, paddingSlider;
		if (!cs2) {
			var slidersGroup = settingsGroup.add("group");
				group = slidersGroup.add("group");
					group.orientation = "column";
					group.alignChildren = ["right", ""];
					group.add("statictext", undefined, "Scale:");
					group.add("statictext", undefined, "Padding:");
				group = slidersGroup.add("group");
					group.orientation = "column";
					scaleText = group.add("edittext", undefined, settings.scale * 100);
					scaleText.characters = 4;
					paddingText = group.add("edittext", undefined, settings.padding);
					paddingText.characters = 4;
				group = slidersGroup.add("group");
					group.orientation = "column";
					group.add("statictext", undefined, "%");
					group.add("statictext", undefined, "px");
				group = slidersGroup.add("group");
					group.orientation = "column";
					group.alignChildren = ["fill", ""];
					group.alignment = ["fill", ""];
					scaleSlider = group.add("slider", undefined, settings.scale * 100, 1, 100);
					paddingSlider = group.add("slider", undefined, settings.padding, 0, 4);
		} else {
			group = settingsGroup.add("group");
				group.add("statictext", undefined, "Scale:");
				scaleText = group.add("edittext", undefined, settings.scale * 100);
				scaleText.preferredSize.width = 50;
			scaleSlider = settingsGroup.add("slider", undefined, settings.scale * 100, 1, 100);
			group = settingsGroup.add("group");
				group.add("statictext", undefined, "Padding:");
				paddingText = group.add("edittext", undefined, settings.padding);
				paddingText.preferredSize.width = 50;
			paddingSlider = settingsGroup.add("slider", undefined, settings.padding, 0, 4);
		}

	var outputPathGroup = dialog.add("panel", undefined, "Output Paths");
		outputPathGroup.alignChildren = ["fill", ""];
		outputPathGroup.margins = [10,15,10,10];
		var imagesDirText, imagesDirPreview, jsonPathText, jsonPathPreview;
		if (!cs2) {
			var textGroup = outputPathGroup.add("group");
			textGroup.orientation = "column";
			textGroup.alignChildren = ["fill", ""];
			group = textGroup.add("group");
				group.add("statictext", undefined, "Images:");
				imagesDirText = group.add("edittext", undefined, settings.imagesDir);
				imagesDirText.alignment = ["fill", ""];
			imagesDirPreview = textGroup.add("statictext", undefined, "");
			imagesDirPreview.maximumSize.width = 260;
			group = textGroup.add("group");
				var jsonLabel = group.add("statictext", undefined, "JSON:");
				jsonLabel.justify = "right";
				jsonLabel.minimumSize.width = 41;
				jsonPathText = group.add("edittext", undefined, settings.jsonPath);
				jsonPathText.alignment = ["fill", ""];
			jsonPathPreview = textGroup.add("statictext", undefined, "");
			jsonPathPreview.maximumSize.width = 260;
		} else {
			outputPathGroup.add("statictext", undefined, "Images:");
			imagesDirText = outputPathGroup.add("edittext", undefined, settings.imagesDir);
			imagesDirText.alignment = "fill";
			outputPathGroup.add("statictext", undefined, "JSON:");
			jsonPathText = outputPathGroup.add("edittext", undefined, settings.jsonPath);
			jsonPathText.alignment = "fill";
		}
	var buttonGroup = dialog.add("group");
		var helpButton;
		if (!cs2) helpButton = buttonGroup.add("button", undefined, "Help");
		group = buttonGroup.add("group");
			group.alignment = ["fill", ""];
			group.alignChildren = ["right", ""];
			var runButton = group.add("button", undefined, "OK");
			var cancelButton = group.add("button", undefined, "Cancel");

	// Tooltips.
	writeTemplateCheckbox.helpTip = "When checked, a PNG is written for the currently visible layers.";
	writeJsonCheckbox.helpTip = "When checked, a Spine JSON file is written.";
	trimWhitespaceCheckbox.helpTip = "When checked, blank pixels aroind the edges of each image are removed.";
	scaleSlider.helpTip = "Scales the PNG files. Useful when using higher resolution art in Photoshop than in Spine.";
	paddingSlider.helpTip = "Blank pixels around the edge of each image. Can avoid aliasing artifacts for opaque pixels along the image edge.";
	imagesDirText.helpTip = "The folder to write PNGs. Begin with \"./\" to be relative to the PSD file. Blank to disable writing PNGs.";
	jsonPathText.helpTip = "Output JSON file if ending with \".json\", else the folder to write the JSON file. Begin with \"./\" to be relative to the PSD file. Blank to disable writing a JSON file.";

	// Events.
	scaleText.onChanging = function () { scaleSlider.value = scaleText.text; };
	scaleSlider.onChanging = function () { scaleText.text = Math.round(scaleSlider.value); };
	paddingText.onChanging = function () { paddingSlider.value = paddingText.text; };
	paddingSlider.onChanging = function () { paddingText.text = Math.round(paddingSlider.value); };
	cancelButton.onClick = function () {
		cancel = true;
		dialog.close();
		return;
	};
	if (!cs2) helpButton.onClick = showHelpDialog;
	jsonPathText.onChanging = function () {
		var text = jsonPathText.text ? jsonPath(jsonPathText.text) : "<no JSON output>";
		if (!cs2) {
			jsonPathPreview.text = text;
			jsonPathPreview.helpTip = text;
		} else
			jsonPathText.helpTip = text;
	};
	imagesDirText.onChanging = function () {
		var text = imagesDirText.text ? absolutePath(imagesDirText.text) : "<no image output>";
		if (!cs2) {
			imagesDirPreview.text = text;
			imagesDirPreview.helpTip = text;
		} else
			imagesDirText.helpTip = text;
	};

	// Run now.
	jsonPathText.onChanging();
	imagesDirText.onChanging();

	function updateSettings () {
		settings.ignoreHiddenLayers = ignoreHiddenLayersCheckbox.value;
		settings.ignoreBackground = ignoreBackgroundCheckbox.value;
		settings.writeTemplate = writeTemplateCheckbox.value;
		settings.writeJson = writeJsonCheckbox.value;
		settings.trimWhitespace = trimWhitespaceCheckbox.value;

		var scaleValue = parseFloat(scaleText.text);
		if (scaleValue > 0 && scaleValue <= 100) settings.scale = scaleValue / 100;

		settings.imagesDir = imagesDirText.text;
		settings.jsonPath = jsonPathText.text;

		var paddingValue = parseInt(paddingText.text);
		if (paddingValue >= 0) settings.padding = paddingValue;
	}

	runButton.onClick = function () {
		if (scaleText.text <= 0 || scaleText.text > 100) {
			alert("Scale must be between > 0 and <= 100.");
			return;
		}
		if (paddingText.text < 0) {
			alert("Padding must be >= 0.");
			return;
		}

		updateSettings();
		saveSettings();

		ignoreHiddenLayersCheckbox.enabled = false;
		ignoreBackgroundCheckbox.enabled = false;
		writeTemplateCheckbox.enabled = false;
		writeJsonCheckbox.enabled = false;
		trimWhitespaceCheckbox.enabled = false;
		scaleText.enabled = false;
		scaleSlider.enabled = false;
		paddingText.enabled = false;
		paddingSlider.enabled = false;
		imagesDirText.enabled = false;
		jsonPathText.enabled = false;
		if (!cs2) helpButton.enabled = false;
		runButton.enabled = false;
		cancelButton.enabled = false;

		var rulerUnits = app.preferences.rulerUnits;
		app.preferences.rulerUnits = Units.PIXELS;
		try {
			// var start = new Date().getTime();
			run();
			// alert(new Date().getTime() - start);
		} catch (e) {
			alert("An unexpected error has occurred.\n\nTo debug, run the PhotoshopToSpine script using Adobe ExtendScript "
				+ "with \"Debug > Do not break on guarded exceptions\" unchecked.");
			debugger;
		} finally {
			if (activeDocument != originalDoc) activeDocument.close(SaveOptions.DONOTSAVECHANGES);
			app.preferences.rulerUnits = rulerUnits;
			dialog.close();
		}
	};

	dialog.center();
	dialog.show();
}

function loadSettings () {
	var options = null;
	try {
		options = app.getCustomOptions(sID("settings"));
	} catch (e) {
	}

	var settings = {};
	for (var key in defaultSettings) {
		if (!defaultSettings.hasOwnProperty(key)) continue;
		var typeID = sID(key);
		if (options && options.hasKey(typeID))
			settings[key] = options["get" + getOptionType(defaultSettings[key])](typeID);
		else
			settings[key] = defaultSettings[key];
	}
	return settings;
}

function saveSettings () {
	if (cs2) return; // No putCustomOptions.
	var action = new ActionDescriptor();
	for (var key in defaultSettings) {
		if (!defaultSettings.hasOwnProperty(key)) continue;
		action["put" + getOptionType(defaultSettings[key])](sID(key), settings[key]);
	}
	app.putCustomOptions(sID("settings"), action, true);
}

function getOptionType (value) {
	switch (typeof(value)) {
	case "boolean": return "Boolean";
	case "string": return "String";
	case "number": return "Double";
	};
	throw new Error("Invalid default setting: " + value);
}

// Help dialog.

function showHelpDialog () {
	var dialog = new Window("dialog", "PhotoshopToSpine - Help");
	dialog.alignChildren = ["fill", ""];
	dialog.orientation = "column";
	dialog.alignment = ["", "top"];

	var helpText = dialog.add("statictext", undefined, ""
		+ "This script writes layers as images and creates a JSON file to bring the images into Spine with the same positions and draw order they had in Photoshop.\n"
		+ "\n"
		+ "The Photoshop ruler origin corresponds to 0,0 in Spine.\n"
		+ "\n"
		+ "Tags in square brackets can be used in layer and group names to customize the output.\n"
		+ "\n"
		+ "Group names:\n"
		+ "•  [bone]  Slot and bone layers in the group are placed under a bone, named after the group. The bone is created at the center of a visible attachment.\n"
		+ "•  [slot]  Layers in the group are placed in a slot, named after the group.\n"
		+ "•  [skin]  Layers in the group are placed in a skin, named after the group. Skin images are output in a subfolder for the skin.\n"
		+ "•  [merge]  Layers in the group are merged and a single image is output, named after the group.\n"
		+ "•  [folder]  Layers in the group will be output in a subfolder. Folder groups can be nested.\n"
		+ "•  [ignore]  Layers in the group and any child groups will not be output.\n"
		+ "\n"
		+ "Layer names:\n"
		+ "•  [ignore]  The layer will not be output.\n"
		+ "•  [path:name]  Specifies the image file name, which can be different from the attachment name. Whitespace trimming is required. Can be used on a group with [merge]."
	, {multiline: true});
	helpText.preferredSize.width = 325;

	var closeButton = dialog.add("button", undefined, "Close");
	closeButton.alignment = ["center", ""];

	closeButton.onClick = function () {
		dialog.close();
	};

	dialog.center();
	dialog.show();
}

// Progress dialog:

function showProgressDialog () {
	var dialog = new Window("palette", "PhotoshopToSpine - Processing...");
	dialog.alignChildren = "fill";
	dialog.orientation = "column";

	var message = dialog.add("statictext", undefined, "Initializing...");

	var group = dialog.add("group");
		var bar = group.add("progressbar");
		bar.preferredSize = [300, 16];
		bar.maxvalue = 10000;
		var cancelButton = group.add("button", undefined, "Cancel");

	cancelButton.onClick = function () {
		cancel = true;
		cancelButton.enabled = false;
		return;
	};

	dialog.center();
	dialog.show();
	dialog.active = true;

	progress = {
		dialog: dialog,
		bar: bar,
		message: message
	};
}

function setProgress (percent, layerName) {
	progress.bar.value = 10000 * percent;
	progress.message.text = "Layer: " + layerName;
	if (!progress.dialog.active) progress.dialog.active = true;
}

// PhotoshopToSpine utility:

function unlock (layer) {
	if (layer.allLocked) layer.allLocked = false;
	if (!layer.layers) return;
	for (var i = layer.layers.length - 1; i >= 0; i--)
		unlock(layer.layers[i]);
}

function deleteLayer (layer) {
	unlock(layer);
	activeDocument.activeLayer = activeDocument.artLayers[0];
	layer.remove();
}

function collectLayers (parent, collect) {
	outer:
	for (var i = parent.layers.length - 1; i >= 0; i--) {
		if (cancel) return;
		var layer = parent.layers[i];
		if (settings.ignoreHiddenLayers && !layer.visible) continue;
		if (settings.ignoreBackground && layer.isBackgroundLayer) {
			deleteLayer(layer);
			continue;
		}
		if (findTag(layer, "ignore")) {
			deleteLayer(layer);
			continue;
		}
		var group = isGroup(layer);
		if (!group && layer.bounds[2] == 0 && layer.bounds[3] == 0) {
			deleteLayer(layer);
			continue;
		}

		// Ensure tags are valid.
		var re = /\[([^\]]+)\]/g;
		while (true) {
			var matches = re.exec(layer.name);
			if (!matches) break;
			var tag = matches[1].toLowerCase();
			if (group) {
				if (!isValidGroupTag(tag)) {
					var message = "Invalid group name:\n\n" + layer.name;
					if (isValidLayerTag(tag))
						message += "\n\nThe [" + tag + "] tag is only valid for layers, not for groups.";
					else
						message += "\n\nThe [" + tag + "] tag is not a valid tag.";
					error(message);
					continue outer;
				}
			} else if (!isValidLayerTag(tag)) {
				var message = "Invalid layer name:\n\n" + layer.name;
				if (isValidGroupTag(tag))
					message += "\n\nThe [" + tag + "] tag is only valid for groups, not for layers.";
				else
					message += "\n\nThe [" + tag + "] tag is not a valid tag.";
				error(message);
				continue outer;
			}
		}

		// Path is only valid if trimming whitespace.
		if (!settings.trimWhitespace && layer.name.search(/\[path:[^\]]+\]/i, "") != -1) {
			error("The [path:name] tag requires whitespace trimming to be enabled:\n" + layer.name);
			continue outer;
		}

		// Ensure only one tag, except path.
		if (layer.name.replace(/\[path:[^\]]+\]/i, "").replace(/\[[^\]]+\]/, "").search(/\[[^\]]+\]/) != -1) {
			error("A " + (group ? "group" : "layer") + " name has mutually exclusive tags:\n" + layer.name);
			continue outer;
		}

		var changeVisibility = layer.kind == LayerKind.NORMAL || group;
		if (changeVisibility) {
			layer.wasVisible = layer.visible;
			layer.visible = true;
			if (layer.allLocked) layer.allLocked = false;
		}

		if (group && findTag(layer, "merge")) {
			collectGroupMerge(layer);
			if (!layer.layers || layer.layers.length == 0) continue;
		} else if (layer.layers && layer.layers.length > 0) {
			collectLayers(layer, collect);
			continue;
		}

		if (changeVisibility) layer.visible = false;
		collect.push(layer);
	}
}

function collectGroupMerge (parent) {
	if (!parent.layers) return;
	for (var i = parent.layers.length - 1; i >= 0; i--) {
		var layer = parent.layers[i];
		if (settings.ignoreHiddenLayers && !layer.visible) continue;
		if (findTag(layer, "ignore")) {
			deleteLayer(layer);
			continue;
		}

		collectGroupMerge(layer);
	}
}

function isValidGroupTag (tag) {
	switch (tag) {
	case "bone":
	case "slot":
	case "skin":
	case "merge":
	case "folder":
	case "ignore":
		return true;
	}
	if (startsWith(tag, "path:")) return true;
	return false;
}

function isValidLayerTag (tag) {
	switch (tag) {
	case "ignore":
		return true;
	}
	if (startsWith(tag, "path:")) return true;
	return false;
}

function isGroup (layer) {
	return layer.typename == "LayerSet";
}

function stripTags (name) {
	return trim(name.replace(/\[[^\]]+\]/g, ""));
}

function findTagLayer (layer, tag) {
	while (layer) {
		if (tag == "ignore" || isGroup(layer)) { // Non-group layers can only have ignore tag.
			if (layer.name.toLowerCase().indexOf("[" + tag + "]") != -1) return layer;
		}
		layer = layer.parent;
	}
	return null;
}

function findTag (layer, tag, otherwise) {
	var found = findTagLayer(layer, tag);
	return found ? stripTags(found.name) : otherwise;
}

function findTagValueLayer (layer, tag) {
	var re = new RegExp("\\[" + tag +":([^\\]]+)\\]", "i");
	while (layer) {
		var matches = re.exec(layer.name);
		if (matches && matches.length) return trim(matches[1]);
		layer = layer.parent;
	}
	return null;
}

function findTagValue (layer, tag, otherwise) {
	return findTagValueLayer(layer, tag) || otherwise;
}

function getParentBone (boneLayer, bones) {
	var parentName = findTag(boneLayer.parent, "bone", "root");
	var parent = get(bones, parentName);
	if (!parent) { // Parent bone group with no attachment layers.
		var parentParent = getParentBone(boneLayer.parent, bones);
		set(bones, parentName, parent = { name: parentName, parent: parentParent, children: [], x: 0, y: 0 });
		parentParent.children.push(parent);
	}
	return parent;
}

function jsonPath (jsonPath) {
	if (endsWith(jsonPath, ".json")) {
		var index = jsonPath.replace(/\\/g, "/").lastIndexOf("/");
		if (index != -1) return absolutePath(jsonPath.slice(0, index + 1)) + jsonPath.slice(index + 1);
		return absolutePath("./") + jsonPath;
	} 
	var name = decodeURI(originalDoc.name);
	return absolutePath(jsonPath) + name.substring(0, name.indexOf(".")) + ".json";
}

function folders (layer, path) {
	var folderLayer = findTagLayer(layer, "folder");
	return folderLayer ? folders(folderLayer.parent, stripTags(folderLayer.name) + "/" + path) : path;
}

function error (message) {
	errors.push(message);
}

// Photoshop utility:

function get (object, name) {
	return object["_" + name];
}
function set (object, name, value) {
	object["_" + name] = value;
}
function stripName (name) {
	return name.substring(1);
}

function scaleImage () {
	var imageSize = activeDocument.width.as("px") * settings.scale;
	activeDocument.resizeImage(UnitValue(imageSize, "px"), null, null, ResampleMethod.BICUBICSHARPER);
}

var history;
function storeHistory () {
	history = activeDocument.activeHistoryState;
}
function restoreHistory () {
	activeDocument.activeHistoryState = history;
}

function scriptDir () {
	var file;
	if (!cs2)
		file = $.fileName;
	else {
		try {
			var error = THROW_ERROR; // Force error which provides the script file name.
		} catch (ex) {
			file = ex.fileName;
		}
	}
	return new File(file).parent + "/";
}

function absolutePath (path) {
	path = trim(path);
	if (!startsWith(path, "./")) {
		var absolute = decodeURI(new File(path).absoluteURI);
		if (!startsWith(absolute, decodeURI(new File("child").parent.absoluteURI))) return absolute + "/";
		path = "./" + path;
	}
	if (path.length == 0)
		path = decodeURI(activeDocument.path);
	else if (startsWith(settings.imagesDir, "./"))
		path = decodeURI(activeDocument.path) + path.substring(1);
	path = (new File(path).fsName).toString();
	path = path.replace(/\\/g, "/");
	if (path.substring(path.length - 1) != "/") path += "/";
	return path;
}

function cID (id) {
	return charIDToTypeID(id);
}

function sID (id) {
	return stringIDToTypeID(id);
}

function bgColor (control, r, g, b) {
	control.graphics.backgroundColor = control.graphics.newBrush(control.graphics.BrushType.SOLID_COLOR, [r, g, b]);
}

function deselectLayers () {
	var desc = new ActionDescriptor();
	var ref = new ActionReference();
	ref.putEnumerated(cID("Lyr "), cID("Ordn"), cID("Trgt"));
	desc.putReference(cID("null"), ref);
	executeAction(sID("selectNoLayers"), desc, DialogModes.NO);
}

function convertToRGB () {
	var desc = new ActionDescriptor();
	desc.putClass(cID("T   "), cID("RGBM"));
	desc.putBoolean(cID("Mrge"), false);
	desc.putBoolean(cID("Rstr"), true);
	executeAction(cID("CnvM"), desc, DialogModes.NO);
}

function savePNG (file) {
	var options = new PNGSaveOptions();
	options.compression = 6;
	activeDocument.saveAs(file, options, true, Extension.LOWERCASE);
}

// JavaScript utility:

function countAssocArray (obj) {
	var count = 0;
	for (var key in obj)
		if (obj.hasOwnProperty(key)) count++;
	return count;
}

function trim (value) {
	return value.replace(/^\s+|\s+$/g, "");
}

function startsWith (str, prefix) {
	return str.indexOf(prefix) === 0;
}

function endsWith (str, suffix) {
	return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

function quote (value) {
	return '"' + value.replace(/"/g, '\\"') + '"';
}
