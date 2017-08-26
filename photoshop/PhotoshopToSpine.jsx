// This script exports Adobe Photoshop layers as individual PNGs. It also
// writes a JSON file which can be imported into Spine where the images
// will be displayed in the same positions and draw order.

// Run by double clicking from OS file explorer (CS2+).
#target photoshop
app.bringToFront();

var version = parseInt(app.version);

var originalDoc;
try {
	originalDoc = app.activeDocument;
} catch (ignored) {}

var defaultSettings = {
	writePngs: true,
	writeTemplate: false,
	writeJson: true,
	ignoreHiddenLayers: true,
	pngScale: 1,
	groupsAsSkins: false,
	useRulerOrigin: false,
	imagesDir: "./images/",
	projectDir: "",
	padding: 1
};
var settings = loadSettings();
showSettingsDialog();

var progress, cancel;
function run () {
	showProgressDialog();

	// Output dirs.
	var absProjectDir = absolutePath(settings.projectDir);
	new Folder(absProjectDir).create();
	var absImagesDir = absolutePath(settings.imagesDir);
	var imagesFolder = new Folder(absImagesDir);
	imagesFolder.create();
	var relImagesDir = imagesFolder.getRelativeURI(absProjectDir);
	relImagesDir = relImagesDir == "." ? "" : (relImagesDir + "/");

	// Get ruler origin.
	var xOffSet = 0, yOffSet = 0;
	if (settings.useRulerOrigin) {
		var ref = new ActionReference();
		ref.putEnumerated(charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
		var desc = executeActionGet(ref);
		xOffSet = desc.getInteger(app.stringIDToTypeID("rulerOriginH")) >> 16;
		yOffSet = desc.getInteger(app.stringIDToTypeID("rulerOriginV")) >> 16;
	}

	activeDocument.duplicate();

	// Output template image.
	if (settings.writeTemplate) {
		if (settings.pngScale != 1) {
			scaleImage();
			storeHistory();
		}

		var file = new File(absImagesDir + "template");
		if (file.exists) file.remove();

		activeDocument.saveAs(file, new PNGSaveOptions(), true, Extension.LOWERCASE);

		if (settings.pngScale != 1) restoreHistory();
	}

	if (!settings.writeJson && !settings.writePngs) {
		activeDocument.close(SaveOptions.DONOTSAVECHANGES);
		return;
	}

	// Rasterize all layers.
	try {
		executeAction(app.stringIDToTypeID( "rasterizeAll" ), undefined, DialogModes.NO);
	} catch (ignored) {}

	// Collect and hide layers.
	var layers = [];
	collectLayers(activeDocument, layers);
	var layersCount = layers.length;

	storeHistory();

	// Store the slot names and layers for each skin.
	var slots = {}, skins = { "default": [] };
	for (var i = layersCount - 1; i >= 0; i--) {
		var layer = layers[i];

		// Use groups as skin names.
		var potentialSkinName = trim(layer.parent.name);
		var layerGroupSkin = potentialSkinName.indexOf("-NOSKIN") == -1;
		var skinName = (settings.groupsAsSkins && layer.parent.typename == "LayerSet" && layerGroupSkin) ? potentialSkinName : "default";

		var skinLayers = skins[skinName];
		if (!skinLayers) skins[skinName] = skinLayers = [];
		skinLayers[skinLayers.length] = layer;

		slots[layerName(layer)] = true;
	}

	// Output skeleton and bones.
	var json = '{"skeleton":{"images":"' + relImagesDir + '"},\n"bones":[{"name":"root"}],\n"slots":[\n';

	// Output slots.
	var slotsCount = countAssocArray(slots);
	var slotIndex = 0;
	for (var slotName in slots) {
		if (!slots.hasOwnProperty(slotName)) continue;

		// Use image prefix if slot's attachment is in the default skin.
		var attachmentName = slotName;
		var defaultSkinLayers = skins["default"];
		for (var i = defaultSkinLayers.length - 1; i >= 0; i--) {
			if (layerName(defaultSkinLayers[i]) == slotName) {
				attachmentName = slotName;
				break;
			}
		}

		json += '\t{"name":"' + slotName + '","bone":"root","attachment":"' + attachmentName + '"}';
		slotIndex++;
		json += slotIndex < slotsCount ? ",\n" : "\n";
	}
	json += '],\n"skins":{\n';

	var skinsCount = 0, totalLayerCount = 0;
	for (var skinName in skins) {
		if (skins.hasOwnProperty(skinName)) {
			skinsCount++;
			totalLayerCount += skins[skinName].length;
		}
	}

	// Output skins.
	var skinIndex = 0, layerCount = 0;
	for (var skinName in skins) {
		if (!skins.hasOwnProperty(skinName)) continue;
		json += '\t"' + skinName + '":{\n';

		var skinLayers = skins[skinName];
		var skinLayersCount = skinLayers.length;
		var skinLayerIndex = 0;
		for (var i = skinLayersCount - 1; i >= 0; i--) {
			var layer = skinLayers[i];

			if (cancel) {
				activeDocument.close(SaveOptions.DONOTSAVECHANGES);
				return;
			}
			setProgress(++layerCount / totalLayerCount, trim(layer.name));

			var slotName = layerName(layer);
			var placeholderName, attachmentName;
			if (skinName == "default") {
				placeholderName = slotName;
				attachmentName = placeholderName;
			} else {
				placeholderName = slotName;
				attachmentName = skinName + "/" + slotName;
			}

			var x = activeDocument.width.as("px") * settings.pngScale;
			var y = activeDocument.height.as("px") * settings.pngScale;

			layer.visible = true;
			if (!layer.isBackgroundLayer) activeDocument.trim(TrimType.TRANSPARENT, false, true, true, false);
			x -= activeDocument.width.as("px") * settings.pngScale;
			y -= activeDocument.height.as("px") * settings.pngScale;
			if (!layer.isBackgroundLayer) activeDocument.trim(TrimType.TRANSPARENT, true, false, false, true);
			var width = activeDocument.width.as("px") * settings.pngScale + settings.padding * 2;
			var height = activeDocument.height.as("px") * settings.pngScale + settings.padding * 2;

			// Save image.
			if (settings.writePngs) {
				if (settings.pngScale != 1) scaleImage();
				if (settings.padding > 0) activeDocument.resizeCanvas(width, height, AnchorPosition.MIDDLECENTER);

				if (skinName != "default") new Folder(absImagesDir + skinName).create();
				activeDocument.saveAs(new File(absImagesDir + attachmentName), new PNGSaveOptions(), true, Extension.LOWERCASE);
			}

			restoreHistory();
			layer.visible = false;

			x += Math.round(width) / 2;
			y += Math.round(height) / 2;

			// Make relative to the Photoshop document ruler origin.
			if (settings.useRulerOrigin) {
				x -= xOffSet * settings.pngScale;
				y -= activeDocument.height.as("px") * settings.pngScale - yOffSet * settings.pngScale; // Invert y.
			}

			if (attachmentName == placeholderName) {
				json += '\t\t"' + slotName + '":{"' + placeholderName + '":{'
					+ '"x":' + x + ',"y":' + y + ',"width":' + Math.round(width) + ',"height":' + Math.round(height) + '}}';
			} else {
				json += '\t\t"' + slotName + '":{"' + placeholderName + '":{"name":"' + attachmentName + '", '
					+ '"x":' + x + ',"y":' + y + ',"width":' + Math.round(width) + ',"height":' + Math.round(height) + '}}';
			}

			skinLayerIndex++;
			json += skinLayerIndex < skinLayersCount ? ",\n" : "\n";
		}
		json += "\t\}";

		skinIndex++;
		json += skinIndex < skinsCount ? ",\n" : "\n";
	}
	json += '},\n"animations":{"animation":{}}\n}';

	activeDocument.close(SaveOptions.DONOTSAVECHANGES);

	// Output JSON file.
	if (settings.writeJson) {
		var name = decodeURI(originalDoc.name);
		name = name.substring(0, name.indexOf("."));
		var file = new File(absProjectDir + name + ".json");
		file.encoding = "UTF-8";
		file.remove();
		file.open("w", "TEXT");
		file.lineFeed = "\n";
		file.write(json);
		file.close();
	}
}

// Settings dialog and settings:

function showSettingsDialog () {
	if (!originalDoc) {
		alert("Please open a document before running the PhotoshopToSpine script.");
		return;
	}
	if (!hasFilePath()) {
		alert("Please save the document before running the PhotoshopToSpine script.");
		return;
	}

	var dialog = new Window("dialog", "PhotoshopToSpine - Settings");
	dialog.alignChildren = "fill";

	var checkboxGroup = dialog.add("group");
		var group = checkboxGroup.add("group");
			group.orientation = "column";
			group.alignChildren = "left";
			var writePngsCheckbox = group.add("checkbox", undefined, " Write layers as PNGs");
			writePngsCheckbox.value = settings.writePngs;
			var writeTemplateCheckbox = group.add("checkbox", undefined, " Write a template PNG");
			writeTemplateCheckbox.value = settings.writeTemplate;
			var writeJsonCheckbox = group.add("checkbox", undefined, " Write Spine JSON");
			writeJsonCheckbox.value = settings.writeJson;
		group = checkboxGroup.add("group");
			group.orientation = "column";
			group.alignChildren = "left";
			var ignoreHiddenLayersCheckbox = group.add("checkbox", undefined, " Ignore hidden layers");
			ignoreHiddenLayersCheckbox.value = settings.ignoreHiddenLayers;
			var groupsAsSkinsCheckbox = group.add("checkbox", undefined, " Use groups as skins");
			groupsAsSkinsCheckbox.value = settings.groupsAsSkins;
			var useRulerOriginCheckbox = group.add("checkbox", undefined, " Use ruler origin as 0,0");
			useRulerOriginCheckbox.value = settings.useRulerOrigin;

	var slidersGroup = dialog.add("group");
		group = slidersGroup.add("group");
			group.orientation = "column";
			group.alignChildren = "right";
			group.add("statictext", undefined, "PNG scale:");
			group.add("statictext", undefined, "Padding:");
		group = slidersGroup.add("group");
			group.orientation = "column";
			var scaleText = group.add("edittext", undefined, settings.pngScale * 100);
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
			var scaleSlider = group.add("slider", undefined, settings.pngScale * 100, 1, 100);
			var paddingSlider = group.add("slider", undefined, settings.padding, 0, 4);
	scaleText.onChanging = function () { scaleSlider.value = scaleText.text; };
	scaleSlider.onChanging = function () { scaleText.text = Math.round(scaleSlider.value); };
	paddingText.onChanging = function () { paddingSlider.value = paddingText.text; };
	paddingSlider.onChanging = function () { paddingText.text = Math.round(paddingSlider.value); };

	var outputGroup = dialog.add("panel", undefined, "Output directories");
		outputGroup.alignChildren = "fill";
		outputGroup.margins = [10,15,10,10];
		var textGroup = outputGroup.add("group");
			group = textGroup.add("group");
				group.orientation = "column";
				group.alignChildren = "right";
				group.add("statictext", undefined, "Images:");
				group.add("statictext", undefined, "JSON:");
			group = textGroup.add("group");
				group.orientation = "column";
				group.alignChildren = "fill";
				group.alignment = ["fill", ""];
				var imagesDirText = group.add("edittext", undefined, settings.imagesDir);
				var projectDirText = group.add("edittext", undefined, settings.projectDir);
		outputGroup.add("statictext", undefined, "Begin paths with \"./\" to be relative to the PSD file.").alignment = "center";

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
		settings.writePngs = writePngsCheckbox.value;
		settings.writeTemplate = writeTemplateCheckbox.value;
		settings.writeJson = writeJsonCheckbox.value;
		settings.ignoreHiddenLayers = ignoreHiddenLayersCheckbox.value;
		var scaleValue = parseFloat(scaleText.text);
		if (scaleValue > 0 && scaleValue <= 100) settings.pngScale = scaleValue / 100;
		settings.groupsAsSkins = groupsAsSkinsCheckbox.value;
		settings.useRulerOrigin = useRulerOriginCheckbox.value;
		settings.imagesDir = imagesDirText.text;
		settings.projectDir = projectDirText.text;
		var paddingValue = parseInt(paddingText.text);
		if (paddingValue >= 0) settings.padding = paddingValue;
	}

	dialog.onClose = function() {
		updateSettings();
		saveSettings();
	};

	runButton.onClick = function () {
		if (scaleText.text <= 0 || scaleText.text > 100) {
			alert("PNG scale must be between > 0 and <= 100.");
			return;
		}
		if (paddingText.text < 0) {
			alert("Padding must be >= 0.");
			return;
		}
		runButton.enabled = false;
		writePngsCheckbox.enabled = false;
		writeTemplateCheckbox.enabled = false;
		writeJsonCheckbox.enabled = false;
		ignoreHiddenLayersCheckbox.enabled = false;
		scaleText.enabled = false;
		groupsAsSkinsCheckbox.enabled = false;
		useRulerOriginCheckbox.enabled = false;
		imagesDirText.enabled = false;
		projectDirText.enabled = false;
		paddingText.enabled = false;

		var rulerUnits = app.preferences.rulerUnits;
		app.preferences.rulerUnits = Units.PIXELS;
		try {
			run();
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
		options = app.getCustomOptions(app.stringIDToTypeID("settings"));
	} catch (e) {
	}

	var settings = {};
	for (var key in defaultSettings) {
		if (!defaultSettings.hasOwnProperty(key)) continue;
		var typeID = app.stringIDToTypeID(key);
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
		action["put" + getOptionType(defaultSettings[key])](app.stringIDToTypeID(key), settings[key]);
	}
	app.putCustomOptions(app.stringIDToTypeID("settings"), action, true);
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
	dialog.preferredSize = [350, 60];
	dialog.orientation = "column";

	var message = dialog.add("statictext", undefined, "Initializing...");

	var bar = dialog.add("progressbar");
	bar.preferredSize = [300, 16];
	bar.maxvalue = 10000;

	dialog.center();
	dialog.show();

	progress = {
		dialog: dialog,
		bar: bar,
		message: message
	};
}

function setProgress (percent, layerName) {
	progress.message.text = "Layer: " + layerName;
	progress.bar.value = 10000 * percent;

	if (version >= 11) {
		// app.refresh(); // Slow.
		progress.dialog.update();
	} else { // CS3 and below.
		var action = new ActionDescriptor();
		action.putEnumerated(app.stringIDToTypeID("state"), app.stringIDToTypeID("state"), app.stringIDToTypeID("redrawComplete"));
		app.executeAction(app.stringIDToTypeID("wait"), action, DialogModes.NO);
	}
}

// Photoshop utility:

function scaleImage () {
	var imageSize = activeDocument.width.as("px");
	activeDocument.resizeImage(UnitValue(imageSize * settings.pngScale, "px"), null, null, ResampleMethod.BICUBICSHARPER);
}

var historyIndex;
function storeHistory () {
	historyIndex = activeDocument.historyStates.length - 1;
}
function restoreHistory () {
	activeDocument.activeHistoryState = activeDocument.historyStates[historyIndex];
}

function collectLayers (layer, collect) {
	for (var i = 0, n = layer.layers.length; i < n; i++) {
		var child = layer.layers[i];
		if (settings.ignoreHiddenLayers && !child.visible) continue;
		if (child.bounds[2] == 0 && child.bounds[3] == 0) continue;
		if (child.layers && child.layers.length > 0)
			collectLayers(child, collect);
		else if (child.kind == LayerKind.NORMAL) {
			collect.push(child);
			child.visible = false;
		}
	}
}

function hasFilePath () {
	var ref = new ActionReference();
	ref.putEnumerated(charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
	return executeActionGet(ref).hasKey(app.stringIDToTypeID("fileReference"));
}

function absolutePath (path) {
	path = trim(path);
	if (path.length == 0)
		path = activeDocument.path.toString();
	else if (settings.imagesDir.indexOf("./") == 0)
		path = activeDocument.path + path.substring(1);
	path = path.replace(/\\/g, "/");
	if (path.substring(path.length - 1) != "/") path += "/";
	return path;
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

function endsWith (str, suffix) {
	return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

function stripSuffix (str, suffix) {
	if (endsWith(str.toLowerCase(), suffix.toLowerCase())) str = str.substring(0, str.length - suffix.length);
	return str;
}

function layerName (layer) {
	return stripSuffix(trim(layer.name), ".png").replace(/[:\/\\*\?\"\<\>\|]/g, "");
}
