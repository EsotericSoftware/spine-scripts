#target photoshop
app.bringToFront();

// This script exports Adobe Photoshop layers as individual PNGs. It also
// writes a JSON file which can be imported into Spine where the images
// will be displayed in the same positions and draw order.

var version = parseInt(app.version);

var originalDoc;
try {
	originalDoc = app.activeDocument;
} catch (ignored) {}

var defaultSettings = {
	writeTemplate: false,
	ignoreHiddenLayers: false,
	ignoreBackground: true,
	scale: 1,
	padding: 1,
	imagesDir: "./images/",
	jsonPath: "./",
};
var settings = loadSettings();
showSettingsDialog();

var progress, cancel;
function run () {
	showProgressDialog();

	// Output dirs.
	var jsonFile = new File(jsonPath(settings.jsonPath));
	jsonFile.parent.create();
	var imagesDir = absolutePath(settings.imagesDir);
	var imagesFolder = new Folder(imagesDir);
	imagesFolder.create();
	var relImagesDir = imagesFolder.getRelativeURI(jsonFile.parent);
	relImagesDir = relImagesDir == "." ? "" : (relImagesDir + "/");

	// Get ruler origin.
	var action = new ActionReference();
	action.putEnumerated(charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
	var result = executeActionGet(action);
	var xOffSet = result.getInteger(stringIDToTypeID("rulerOriginH")) >> 16;
	var yOffSet = result.getInteger(stringIDToTypeID("rulerOriginV")) >> 16;

	activeDocument.duplicate();

	// Output template image.
	if (settings.writeTemplate) {
		if (settings.scale != 1) {
			scaleImage();
			storeHistory();
		}

		var file = new File(imagesDir + "template.png");
		if (file.exists) file.remove();

		activeDocument.saveAs(file, new PNGSaveOptions(), true, Extension.LOWERCASE);

		if (settings.scale != 1) restoreHistory();
	}

	if (!settings.jsonPath && !settings.imagesDir) {
		activeDocument.close(SaveOptions.DONOTSAVECHANGES);
		return;
	}

	// Rasterize all layers.
	try {
		executeAction(stringIDToTypeID( "rasterizeAll" ), undefined, DialogModes.NO);
	} catch (ignored) {}

	// Collect and hide layers.
	var layers = [];
	collectLayers(activeDocument, layers);
	var layersCount = layers.length;

	// Store the slot names and layers for each skin.
	var slots = {}, skins = { "default": [] };
	var slotsCount = 0, skinsCount = 0, totalLayerCount = 0;
	outer:
	for (var i = layersCount - 1; i >= 0; i--) {
		var layer = layers[i];
		layer.attachmentName = folders(layer, "") + stripTags(layer.name);
		layer.slotName = hasTag(layer, "slot", layer.attachmentName);

		if (!slots.hasOwnProperty(layer.slotName)) slotsCount++;
		slots[layer.slotName] = layer.wasVisible ? layer.attachmentName : null;

		var skinName = hasTag(layer, "skin", "default");
		var skinSlots = skins[skinName];
		if (!skinSlots) {
			skins[skinName] = skinSlots = {};
			skinsCount++;
		}

		var skinLayers = skinSlots[layer.slotName];
		if (!skinLayers) skinSlots[layer.slotName] = skinLayers = [];
		for (var ii = 0, nn = skinLayers.length; ii < nn; ii++)
			if (skinLayers[ii].attachmentName == layer.attachmentName) continue outer;
		skinLayers[skinLayers.length] = layer;
		totalLayerCount++;
	}

	// Output skeleton and bones.
	var json = '{"skeleton":{"images":"' + relImagesDir + '"},\n"bones":[{"name":"root"}],\n"slots":[\n';

	// Output slots.
	var slotIndex = 0;
	for (var slotName in slots) {
		if (!slots.hasOwnProperty(slotName)) continue;
		var attachmentName = slots[slotName];
		if (attachmentName)
			json += '\t{"name":' + quote(slotName) + ',"bone":"root","attachment":' + quote(attachmentName) + '}';
		else
			json += '\t{"name":' + quote(slotName) + ',"bone":"root"}';
		slotIndex++;
		json += slotIndex < slotsCount ? ",\n" : "\n";
	}
	json += '],\n"skins":{\n';

	// Output skins.
	var skinIndex = 0, layerCount = 0;
	for (var skinName in skins) {
		if (!skins.hasOwnProperty(skinName)) continue;
		json += '\t"' + skinName + '":{\n';

		var skinSlots = skins[skinName];
		var skinSlotIndex = 0, skinSlotsCount = countAssocArray(skinSlots);
		for (var slotName in skinSlots) {
			if (!skinSlots.hasOwnProperty(slotName)) continue;

			json += '\t\t' + quote(slotName) + ':{\n';

			var skinLayers = skinSlots[slotName];
			var skinLayerIndex = 0, skinLayersCount = skinLayers.length;
			for (var i = skinLayersCount - 1; i >= 0; i--) {
				var layer = skinLayers[i];
				layer.visible = true;

				if (cancel) {
					activeDocument.close(SaveOptions.DONOTSAVECHANGES);
					return;
				}
				setProgress(++layerCount / totalLayerCount, trim(layer.name));

				var placeholderName = layer.attachmentName;
				var attachmentName = (skinName == "default" ? "" : skinName + "/") + placeholderName;

				if (isGroup(layer)) {
					activeDocument.activeLayer = layer;
					layer = layer.merge();
				}

				storeHistory();

				var x = activeDocument.width.as("px") * settings.scale;
				var y = activeDocument.height.as("px") * settings.scale;
				if (!layer.isBackgroundLayer) activeDocument.trim(TrimType.TRANSPARENT, false, true, true, false);
				x -= activeDocument.width.as("px") * settings.scale;
				y -= activeDocument.height.as("px") * settings.scale;
				if (!layer.isBackgroundLayer) activeDocument.trim(TrimType.TRANSPARENT, true, false, false, true);
				var width = activeDocument.width.as("px") * settings.scale + settings.padding * 2;
				var height = activeDocument.height.as("px") * settings.scale + settings.padding * 2;

				// Save image.
				if (settings.imagesDir) {
					if (settings.scale != 1) scaleImage();
					if (settings.padding > 0) activeDocument.resizeCanvas(width, height, AnchorPosition.MIDDLECENTER);

					var file = new File(imagesDir + attachmentName);
					file.parent.create();
					activeDocument.saveAs(file, new PNGSaveOptions(), true, Extension.LOWERCASE);
				}

				if (layerCount < totalLayerCount) {
					restoreHistory();
					layer.remove();
				}

				x += Math.round(width) / 2;
				y += Math.round(height) / 2;

				// Make relative to the Photoshop document ruler origin.
				x -= xOffSet * settings.scale;
				y -= (activeDocument.height.as("px") - yOffSet) * settings.scale; // Invert y.

				json += "\t\t\t" + quote(placeholderName) + ':{';
				if (attachmentName != placeholderName) json += '"name":' + quote(attachmentName) + ', ';
				json += '"x":' + x + ',"y":' + y + ',"width":' + Math.round(width) + ',"height":' + Math.round(height);

				json += "}" + (++skinLayerIndex < skinLayersCount ? ",\n" : "\n");
			}

			json += "\t\t}" + (++skinSlotIndex < skinSlotsCount ? ",\n" : "\n");
		}

		json += "\t\}" + (++skinIndex < skinsCount ? ",\n" : "\n");
	}
	json += '},\n"animations":{"animation":{}}\n}';

	activeDocument.close(SaveOptions.DONOTSAVECHANGES);

	// Output JSON file.
	if (settings.jsonPath) {
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
	if (version < 9) {
		alert("Photoshop CS2 or later is required.");
		return;
	}
	if (!originalDoc) {
		alert("Please open a document before running the PhotoshopToSpine script.");
		return;
	}
	if (!hasFilePath()) {
		alert("Please save the document before running the PhotoshopToSpine script.");
		return;
	}

	var dialog = new Window("dialog", "PhotoshopToSpine");
	dialog.alignChildren = "fill";

	var group;

	var settingsGroup = dialog.add("panel", undefined, "Settings");
		settingsGroup.margins = [10,15,10,10];
		var checkboxGroup = settingsGroup.add("group");
			group = checkboxGroup.add("group");
				group.orientation = "column";
				group.alignChildren = "left";
				group.alignment = ["", "top"];
				var ignoreHiddenLayersCheckbox = group.add("checkbox", undefined, " Ignore hidden layers");
				ignoreHiddenLayersCheckbox.value = settings.ignoreHiddenLayers;
			group = checkboxGroup.add("group");
				group.orientation = "column";
				group.alignChildren = "left";
				group.alignment = ["", "top"];
				var writeTemplateCheckbox = group.add("checkbox", undefined, " Write template PNG");
				writeTemplateCheckbox.value = settings.writeTemplate;
		checkboxGroup = settingsGroup.add("group");
			checkboxGroup.alignment = ["left", ""];
			group = checkboxGroup.add("group");
				group.orientation = "column";
				group.alignChildren = "left";
				group.alignment = ["", "top"];
				var ignoreBackgroundCheckbox = group.add("checkbox", undefined, " Ignore background layer");
				ignoreBackgroundCheckbox.value = settings.ignoreBackground;
		var slidersGroup = settingsGroup.add("group");
			group = slidersGroup.add("group");
				group.orientation = "column";
				group.alignChildren = "right";
				group.add("statictext", undefined, "Scale:");
				group.add("statictext", undefined, "Padding:");
			group = slidersGroup.add("group");
				group.orientation = "column";
				var scaleText = group.add("edittext", undefined, settings.scale * 100);
				scaleText.characters = 4;
				var paddingText = group.add("edittext", undefined, settings.padding);
				paddingText.characters = 4;
			group = slidersGroup.add("group");
				group.orientation = "column";
				group.add("statictext", undefined, "%");
				group.add("statictext", undefined, "px");
			group = slidersGroup.add("group");
				group.alignment = ["fill", ""];
				group.orientation = "column";
				group.alignChildren = ["fill", ""];
				var scaleSlider = group.add("slider", undefined, settings.scale * 100, 1, 100);
				var paddingSlider = group.add("slider", undefined, settings.padding, 0, 4);
	scaleText.onChanging = function () { scaleSlider.value = scaleText.text; };
	scaleSlider.onChanging = function () { scaleText.text = Math.round(scaleSlider.value); };
	paddingText.onChanging = function () { paddingSlider.value = paddingText.text; };
	paddingSlider.onChanging = function () { paddingText.text = Math.round(paddingSlider.value); };

	var outputPathGroup = dialog.add("panel", undefined, "Output Paths");
		outputPathGroup.alignChildren = "fill";
		outputPathGroup.margins = [10,15,10,10];
		var textGroup = outputPathGroup.add("group");
			group = textGroup.add("group");
				group.orientation = "column";
				group.alignChildren = "right";
				group.add("statictext", undefined, "Images:");
				group.add("statictext", undefined, "");
				group.add("statictext", undefined, "JSON:");
				group.add("statictext", undefined, "");
			group = textGroup.add("group");
				group.orientation = "column";
				group.alignChildren = "fill";
				group.alignment = ["fill", ""];
				var imagesDirText = group.add("edittext", undefined, settings.imagesDir);
				var imagesDirPreview = group.add("statictext", undefined, "");
				var jsonPathText = group.add("edittext", undefined, settings.jsonPath);
				var jsonPathPreview = group.add("statictext", undefined, "");
	jsonPathText.onChanging = function () {
		jsonPathPreview.text = jsonPathText.text ? jsonPath(jsonPathText.text) : "<no JSON output>";
		jsonPathPreview.helpTip = jsonPathPreview.text;
	};
	jsonPathText.onChanging();
	imagesDirText.onChanging = function () {
		imagesDirPreview.text = imagesDirText.text ? absolutePath(imagesDirText.text) : "<no image output>";
		imagesDirPreview.helpTip = imagesDirPreview.text;
	};
	imagesDirText.onChanging();

	writeTemplateCheckbox.helpTip = "When checked, a PNG is written for the currently visible layers.";
	scaleSlider.helpTip = "Scales the PNG files. Useful when using higher resolution art in Photoshop than in Spine.";
	paddingSlider.helpTip = "Blank pixels around the edge of each image. Can avoid aliasing artifacts for opaque pixels along the image edge.";
	imagesDirText.helpTip = "The folder to write PNGs. Begin with \"./\" to be relative to the PSD file. Blank to disable writing PNGs.";
	jsonPathText.helpTip = "Output JSON file if ending with \".json\", else the folder to write the JSON file. Begin with \"./\" to be relative to the PSD file. Blank to disable writing a JSON file.";

	var group = dialog.add("group");
		group.alignment = "center";
		var runButton = group.add("button", undefined, "OK");
		var cancelButton = group.add("button", undefined, "Cancel");
		cancelButton.onClick = function () {
			cancel = true;
			dialog.close(0);
			return;
		};

	function updateSettings () {
		settings.writeTemplate = writeTemplateCheckbox.value;
		settings.ignoreHiddenLayers = ignoreHiddenLayersCheckbox.value;
		settings.ignoreBackground = ignoreBackgroundCheckbox.value;
		
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

		writeTemplateCheckbox.enabled = false;
		ignoreHiddenLayersCheckbox.enabled = false;
		ignoreBackgroundCheckbox.enabled = false;
		scaleText.enabled = false;
		scaleSlider.enabled = false;
		paddingText.enabled = false;
		paddingSlider.enabled = false;
		imagesDirText.enabled = false;
		jsonPathText.enabled = false;
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
			dialog.close(0);
		}
	};

	dialog.center();
	dialog.show();
}

function loadSettings () {
	var options = null;
	try {
		options = app.getCustomOptions(stringIDToTypeID("settings"));
	} catch (e) {
	}

	var settings = {};
	for (var key in defaultSettings) {
		if (!defaultSettings.hasOwnProperty(key)) continue;
		var typeID = stringIDToTypeID(key);
		if (options && options.hasKey(typeID))
			settings[key] = options["get" + getOptionType(defaultSettings[key])](typeID);
		else
			settings[key] = defaultSettings[key];
	}
	return settings;
}

function saveSettings () {
	var action = new ActionDescriptor();
	for (var key in defaultSettings) {
		if (!defaultSettings.hasOwnProperty(key)) continue;
		action["put" + getOptionType(defaultSettings[key])](stringIDToTypeID(key), settings[key]);
	}
	app.putCustomOptions(stringIDToTypeID("settings"), action, true);
}

function getOptionType (value) {
	switch (typeof(value)) {
	case "boolean": return "Boolean";
	case "string": return "String";
	case "number": return "Double";
	};
	throw new Error("Invalid default setting: " + value);
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
	progress.dialog.active = true;
}

// Photoshop utility:

function scaleImage () {
	var imageSize = activeDocument.width.as("px") * settings.scale;
	activeDocument.resizeImage(UnitValue(imageSize, "px"), null, null, ResampleMethod.BICUBICSHARPER);
}

var historyIndex;
function storeHistory () {
	historyIndex = activeDocument.historyStates.length - 1;
}
function restoreHistory () {
	activeDocument.activeHistoryState = activeDocument.historyStates[historyIndex];
}

function collectLayers (parent, collect) {
	for (var i = parent.layers.length - 1; i >= 0; i--) {
		var layer = parent.layers[i];
		if (settings.ignoreHiddenLayers && !layer.visible) {
			layer.remove();
			continue;
		}
		if (settings.ignoreBackground && layer.isBackgroundLayer) {
			layer.remove();
			continue;
		}
		if (hasTag(layer, "ignore")) {
			layer.remove();
			continue;
		}
		var group = isGroup(layer);
		if (!group && layer.bounds[2] == 0 && layer.bounds[3] == 0) {
			layer.remove();
			continue;
		}

		if (group && hasTag(layer, "merge")) {
			collect.push(layer);
			layer.wasVisible = layer.visible;
			layer.visible = false;
			if (layer.layers) {
				for (var ii = layer.layers.length - 1; ii >= 0; ii--) 
					if (hasTag(layer.layers[ii], "ignore")) layer.layers[ii].remove();
			}
		} else if (layer.layers && layer.layers.length > 0)
			collectLayers(layer, collect);
		else if (layer.kind == LayerKind.NORMAL) {
			collect.push(layer);
			layer.wasVisible = layer.visible;
			layer.visible = false;
		}
	}
}

function hasFilePath () {
	var ref = new ActionReference();
	ref.putEnumerated(charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
	return executeActionGet(ref).hasKey(stringIDToTypeID("fileReference"));
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
	path = path.replace(/\\/g, "/");
	if (path.substring(path.length - 1) != "/") path += "/";
	return path;
}

function isGroup (layer) {
	return layer.typename == "LayerSet";
}

function stripTags (name) {
	return trim(name.replace(/\[[^\]]+\]/g, ""));
}

function hasTagLayer (layer, tag) {
	while (layer) {
		if (tag == "ignore" || isGroup(layer)) { // Non-group layers can only have ignore tag.
			if (layer.name.indexOf("[" + tag + "]") != -1) return layer;
		}
		layer = layer.parent;
	}
	return null;
}

function hasTag (layer, tag, otherwise) {
	var found = hasTagLayer(layer, tag);
	return found ? stripTags(found.name) : otherwise;
}

function jsonPath (jsonPath) {
	if (endsWith(jsonPath, ".json")) {
		var index = jsonPath.replace("\\", "/").lastIndexOf("/");
		if (index != -1) return absolutePath(jsonPath.slice(0, index + 1)) + jsonPath.slice(index + 1);
		return absolutePath("./") + jsonPath;
	} 
	var name = decodeURI(originalDoc.name);
	return absolutePath(jsonPath) + name.substring(0, name.indexOf(".")) + ".json";
}

function folders (layer, path) {
	var folderLayer = hasTagLayer(layer, "folder");
	return folderLayer ? folders(folderLayer.parent, stripTags(folderLayer.name) + "/" + path) : path;
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
	return '"' + value.replace('"', '\\"') + '"';
}
