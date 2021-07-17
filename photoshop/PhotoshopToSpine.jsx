#target photoshop
app.bringToFront();

// This script exports Adobe Photoshop layers as individual PNGs. It also
// writes a JSON file which can be imported into Spine where the images
// will be displayed in the same positions and draw order.

// Copyright (c) 2012-2020, Esoteric Software
// All rights reserved.
// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
//     * Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
//     * Neither the name of Esoteric Software nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

var scriptVersion = 6.8; // This is incremented every time the script is modified, so you know if you have the latest.

var cs2 = parseInt(app.version) < 10;

var originalDoc;
try {
	originalDoc = activeDocument;
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

	var origin = [rulerOrigin("H"), rulerOrigin("V")], xOffSet = origin[0], yOffSet = origin[1];

	activeDocument.duplicate();
	deselectLayers();

	// Uncomment this line to enlarge the canvas so layers are not cropped.
	//activeDocument.revealAll();

	try {
		convertToRGB();
	} catch (ignored) {}
	if (activeDocument.mode != DocumentMode.RGB) {
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

	rasterizeAll();

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
	var skinDuplicates = {};
	var totalLayerCount = 0;
	outer:
	for (var i = 0; i < layersCount; i++) {
		if (cancel) return;
		var layer = layers[i];
		if (layer.kind != LayerKind.NORMAL && !isGroup(layer)) continue;

		var name = stripTags(layer.name).replace(/.png$/, "");
		name = name.replace(/[\\:"*?<>|]/g, "").replace(/^\.+$/, "").replace(/^__drag$/, ""); // Illegal.
		name = name.replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, ""); // Windows.
		if (!name || name.length > 255) {
			error("Layer name is not a valid attachment name:\n\n" + layer.name);
			continue;
		}
		var folderPath = folders(layer, "");
		if (startsWith(name, "/")) {
			name = name.substring(1);
			layer.attachmentName = name;
		} else
			layer.attachmentName = folderPath + name;

		layer.attachmentPath = findTagValue(layer, "path:");
		if (!layer.attachmentPath)
			layer.attachmentPath = layer.attachmentName;
		else if (startsWith(layer.attachmentPath, "/"))
			layer.attachmentPath = layer.attachmentPath.substring(1);
		else
			layer.attachmentPath = folderPath + layer.attachmentPath;

		var bone = null;
		var boneLayer = findTagLayer(layer, "bone");
		if (boneLayer) {
			var parent = getParentBone(boneLayer, bones);
			var boneName = findTagValue(boneLayer, "bone");
			bone = get(bones, boneName);
			if (bone) {
				if (parent != bone.parent) {
					error("Multiple layers for the \"" + boneName + "\" bone have different parent bones:\n\n"
						+ layerPath(bone.layer) + "\n"
						+ layerPath(boneLayer));
					continue;
				}
			} else {
				set(bones, boneName, bone = { name: boneName, parent: parent, children: [], layer: boneLayer });
				parent.children.push(bone);
			}
			bone.x = layer.bounds[0].as("px") * settings.scale - settings.padding;
			bone.x += (layer.bounds[2].as("px") - layer.bounds[0].as("px")) * settings.scale / 2 + settings.padding;
			bone.y = (activeDocument.height.as("px") - layer.bounds[1].as("px")) * settings.scale + settings.padding;
			bone.y -= (layer.bounds[3].as("px") - layer.bounds[1].as("px")) * settings.scale / 2 + settings.padding;
			// Make relative to the Photoshop document ruler origin.
			bone.x -= xOffSet * settings.scale;
			bone.y -= (activeDocument.height.as("px") - yOffSet) * settings.scale;
		}

		var skinName = findTagValue(layer, "skin");
		if (skinName && skinName.toLowerCase() == "default") {
			error("The skin name \"default\" is reserved: " + layerPath(layer) + "\nPlease use a different name.");
			continue;
		}
		if (!skinName) skinName = "default";
		layer.skinName = skinName;
		layer.placeholderName = skinName == "default" ? layer.attachmentName : name;

		layer.slotName = findTagValue(layer, "slot") || name;
		var slot = get(slots, layer.slotName);
		if (!slot) {
			slotsCount++;
			set(slots, layer.slotName, slot = { bone: bone, attachment: layer.wasVisible ? layer.placeholderName : null, placeholders: {} });
		}
		if (layer.blendMode == BlendMode.LINEARDODGE)
			slot.blend = "additive";
		else if (layer.blendMode == BlendMode.MULTIPLY)
			slot.blend = "multiply";
		else if (layer.blendMode == BlendMode.SCREEN)
			slot.blend = "screen";

		var placeholders = get(slot.placeholders, skinName);
		if (!placeholders)
			set(slot.placeholders, skinName, placeholders = {});
		else {
			var existing = get(placeholders, layer.placeholderName);
			if (existing) { // Skin has duplicate placeholders.
				var key = layer.slotName + "|^`" + skinName;
				remove(skinDuplicates, key, existing);
				add(skinDuplicates, key, existing);
				add(skinDuplicates, key, layer);
			}
		}
		set(placeholders, layer.placeholderName, layer);

		var skinSlots = get(skins, skinName);
		if (!skinSlots) {
			set(skins, skinName, skinSlots = {});
			skinsCount++;
		}
		add(skinSlots, layer.slotName, layer);

		totalLayerCount++;
	}

	// Error if a skin has multiple skin placeholders with the same name.
	for (var key in skinDuplicates) {
		if (!skinDuplicates.hasOwnProperty(key)) continue;
		var layers = skinDuplicates[key];
		var message = "Multiple layers for the \"" + layers[0].skinName + "\" skin in the \"" + layers[0].slotName
			+ "\" slot have the same name \"" + layers[0].placeholderName + "\":\n";
		for (var i = 0, n = layers.length; i < n; i++)
			message += "\n" + layerPath(layers[i]);
		error(message + "\n\nRename or use the [ignore] tag for these layers.");
	}

	// Error if a skin placeholder has the same name as a default skin attachment.
	var slotDuplicates = {};
	for (var slotName in slots) {
		if (!slots.hasOwnProperty(slotName)) continue;
		var slot = slots[slotName];

		var defaultPlaceholders = get(slot.placeholders, "default");
		if (!defaultPlaceholders) continue;
		for (var skinName in slot.placeholders) {
			if (!slot.placeholders.hasOwnProperty(skinName)) continue;
			var placeholders = slot.placeholders[skinName];
			if (stripName(skinName) == "default") continue;

			for (var placeholderName in placeholders) {
				if (!placeholders.hasOwnProperty(placeholderName)) continue;

				var existing = get(defaultPlaceholders, stripName(placeholderName));
				if (existing) {
					var layer = placeholders[placeholderName];
					remove(slotDuplicates, layer.slotName, existing);
					add(slotDuplicates, layer.slotName, existing);
					add(slotDuplicates, layer.slotName, layer);
				}
			}
		}
	}
	for (var slotName in slotDuplicates) {
		if (!slotDuplicates.hasOwnProperty(slotName)) continue;
		var layers = slotDuplicates[slotName];
		var message = "Multiple layers for the \"" + layers[0].slotName + "\" slot have the same name \"" + layers[0].placeholderName + "\":\n";
		for (var i = 0, n = layers.length; i < n; i++)
			message += "\n" + layerPath(layers[i]);
		error(message + "\n\nRename or use the [ignore] tag for these layers.");
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

		var skinSlotIndex = 0, skinSlotsCount = countKeys(skinSlots);
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

				var attachmentName = layer.attachmentName, attachmentPath = layer.attachmentPath, placeholderName = layer.placeholderName;
				var isBackgroundLayer = layer.isBackgroundLayer;

				if (isGroup(layer)) {
					activeDocument.activeLayer = layer;
					try {
						layer = layer.merge();
					} catch (ignored) {}
				}

				rasterizeStyles(layer);

				storeHistory();

				var x = 0, y = 0;
				if (settings.trimWhitespace) {
					x = activeDocument.width.as("px") * settings.scale;
					y = activeDocument.height.as("px") * settings.scale;
					if (!isBackgroundLayer) activeDocument.trim(TrimType.TRANSPARENT, false, true, true, false);
					x -= activeDocument.width.as("px") * settings.scale;
					y -= activeDocument.height.as("px") * settings.scale;
					if (!isBackgroundLayer) activeDocument.trim(TrimType.TRANSPARENT, true, false, false, true);
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
	trimWhitespaceCheckbox.helpTip = "When checked, blank pixels around the edges of each image are removed.";
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
		+ "Tags in square brackets can be used anywhere in layer and group names to customize the output. If \":name\" is omitted, the layer or group name is used.\n"
		+ "\n"
		+ "Group and layer names:\n"
		+ "•  [bone] or [bone:name]  Layers, slots, and bones are placed under a bone. The bone is created at the center of a visible layer. Bone groups can be nested.\n"
		+ "•  [slot] or [slot:name]  Layers are placed in a slot.\n"
		+ "•  [skin] or [skin:name]  Layers are placed in a skin. Skin layer images are output in a subfolder for the skin.\n"
		+ "•  [folder] or [folder:name]  Layers images are output in a subfolder. Folder groups can be nested.\n"
		+ "•  [ignore]  Layers, groups, and any child groups will not be output.\n"
		+ "\n"
		+ "Group names:\n"
		+ "•  [merge]  Layers in the group are merged and a single image is output.\n"
		+ "\n"
		+ "Layer names:\n"
		+ "•  The layer name is used for the attachment or skin placeholder name, relative to any parent [skin] or [folder] groups. Can contain / for subfolders.\n"
		+ "•  [path:name]  Specifies the image file name, if it needs to be different from the attachment name. Can be used on a group with [merge].\n"
		+ "\n"
		+ "If a layer name, folder name, or path name starts with / then parent layers won't affect the name."
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
		if (findTagLayer(layer, "ignore")) {
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
			var tag = matches[1];
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
			} else if (tag != "merge" && !isValidLayerTag(tag)) { // Allow merge, the user may have merged manually to save time.
				var message = "Invalid layer name:\n\n" + layer.name;
				if (isValidGroupTag(tag))
					message += "\n\nThe [" + tag + "] tag is only valid for groups, not for layers.";
				else
					message += "\n\nThe [" + tag + "] tag is not a valid tag.";
				error(message);
				continue outer;
			}
		}

		var changeVisibility = layer.kind == LayerKind.NORMAL || group;
		if (changeVisibility) {
			layer.wasVisible = layer.visible;
			layer.visible = true;
			if (layer.allLocked) layer.allLocked = false;
		}

		if (group && findTagLayer(layer, "merge")) {
			collectGroupMerge(layer);
			if (!layer.layers || layer.layers.length == 0) continue;
		} else if (layer.layers && layer.layers.length > 0) {
			collectLayers(layer, collect);
			continue;
		} else if (group)
			continue;

		if (changeVisibility) layer.visible = false;
		collect.push(layer);
	}
}

function collectGroupMerge (parent) {
	if (!parent.layers) return;
	for (var i = parent.layers.length - 1; i >= 0; i--) {
		var layer = parent.layers[i];
		if (settings.ignoreHiddenLayers && !layer.visible) continue;
		if (findTagLayer(layer, "ignore")) {
			deleteLayer(layer);
			continue;
		}

		collectGroupMerge(layer);
	}
}

function isValidGroupTag (tag) {
	return isValidLayerTag(tag) || tag == "merge";
}

function isValidLayerTag (tag) {
	switch (tag) {
	case "bone":
	case "slot":
	case "skin":
	case "folder":
	case "ignore":
		return true;
	}
	if (startsWith(tag, "bone:")) return true;
	if (startsWith(tag, "slot:")) return true;
	if (startsWith(tag, "skin:")) return true;
	if (startsWith(tag, "folder:")) return true;
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
	var groupTag = isValidGroupTag(tag), layerTag = isValidLayerTag(tag);
	if (endsWith(tag, ":")) tag = tag.slice(0, -1);
	var re = new RegExp("\\[" + tag + "(:[^\\]]+)?\\]", "i");
	while (layer) {
		var group = isGroup(layer);
		if (((group && groupTag) || (!group && layerTag)) && re.exec(layer.name)) return layer;
		layer = layer.parent;
	}
	return null;
}

function findTagValue (layer, tag) {
	layer = findTagLayer(layer, tag);
	if (!layer) return null;
	if (endsWith(tag, ":")) tag = tag.slice(0, -1);
	var matches = new RegExp("\\[" + tag + ":([^\\]]+)\\]", "i").exec(layer.name);
	if (matches && matches.length) return trim(matches[1]);
	return stripTags(layer.name);
}

function getParentBone (boneLayer, bones) {
	var parentName = findTagValue(boneLayer.parent, "bone") || "root";
	var parent = get(bones, parentName);
	if (!parent) { // Parent bone group with no attachment layers.
		var parentParent = getParentBone(boneLayer.parent, bones);
		set(bones, parentName, parent = { name: parentName, x: 0, y: 0, parent: parentParent, children: [], layer: boneLayer.parent });
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
	var re = new RegExp("\\[(folder|skin)(:[^\\]]+)?\\]", "i");
	while (layer) {
		var matches = re.exec(layer.name);
		if (matches) {
			var folder = findTagValue(layer, matches[1]);
			if (matches[1] == "skin" && folder == "default") return folders(layer.parent, path);
			if (startsWith(folder, "/")) return folder + "/" + path;
			return folders(layer.parent, folder + "/" + path);
		}
		layer = layer.parent;
	}
	return path;
}

function layerPath (layer) {
	if (!layer) return "";
	var path = layer.name;
	while (true) {
		layer = layer.parent
		if (!layer || layer == activeDocument) return path;
		path = layer.name + "/" + path;
	}
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
function add (object, name, value) {
	var array = object["_" + name];
	if (!array) object["_" + name] = array = [];
	array[array.length] = value;
	return array;
}
function remove (object, name, value) {
	var array = object["_" + name];
	if (!array) return;
	for (var i = 0, n = array.length; i < n; i++) {
		if (array[i] == value) {
			array.splice(i, 1);
			return;
		}
	}
}
function stripName (name) {
	return name.substring(1);
}

function rulerOrigin (axis) {
	var key = sID("rulerOrigin" + axis);
	var action = new ActionReference();
	action.putProperty(sID("property"), key);
	action.putEnumerated(sID("document"), sID("ordinal"), sID("targetEnum")); 
	var result = executeActionGet(action);
	return result.getInteger(key) >> 16;
}

function rasterizeAll () {
	try {
		executeAction(sID("rasterizeAll"), undefined, DialogModes.NO);
	} catch (ignored) {}
}

function rasterizeStyles (layer) {
	try {
		activeDocument.activeLayer = layer;
		var desc = new ActionDescriptor();
		var ref = new ActionReference();
		ref.putEnumerated(cID("Lyr "), cID("Ordn"), cID("Trgt"));
		desc.putReference(cID("null"), ref);
		desc.putEnumerated(cID("What"), sID("rasterizeItem"), sID("layerStyle"));
		executeAction(sID("rasterizeLayer"), desc, DialogModes.NO);
	} catch (ignored) {}
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
	else if (startsWith(path, "./"))
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
	// SaveForWeb changes spaces to dash. Also some users report it writes HTML.
	//var options = new ExportOptionsSaveForWeb();
	//options.format = SaveDocumentType.PNG;
	//options.PNG8 = false;
	//options.transparency = true;
	//options.interlaced = false;
	//options.includeProfile = false;
	//activeDocument.exportDocument(file, ExportType.SAVEFORWEB, options);

	// SaveAs sometimes writes a huge amount of XML in the PNG.
	var options = new PNGSaveOptions();
	options.compression = 6;
	activeDocument.saveAs(file, options, true, Extension.LOWERCASE);
}

// JavaScript utility:

function countKeys (object) {
	var count = 0;
	for (var key in object)
		if (object.hasOwnProperty(key)) count++;
	return count;
}

function joinKeys (object, glue) {
	if (!glue) glue = ", ";
	var value = "";
	for (var key in object) {
		if (object.hasOwnProperty(key)) {
			if (value) value += glue;
			value += key;
		}
	}
	return value;
}

function joinValues (object, glue) {
	if (!glue) glue = ", ";
	var value = "";
	for (var key in object) {
		if (object.hasOwnProperty(key)) {
			if (value) value += glue;
			value += object[key];
		}
	}
	return value;
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
