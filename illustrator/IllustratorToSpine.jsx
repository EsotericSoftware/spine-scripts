// This script exports illustrator layers as individual PNGs.
//
// author: Nathan Sweet
// author: Ivan Gadzhega
// rev: 12

const L2PNG_NAMESPACE = "http://esotericsoftware.com/l2png";
const L2PNG_PREFIX = "l2png:";

const IGNORE_HIDDEN_LAYERS_ID = "ignoreHiddenLayers";
const WRITETE_MPLATE_ID = "writeTemplate";
const WRITETE_JSON_ID = "writeJson";
const PNG_SCALE_ID = "pngScale";
const IMAGES_DIR_ID = "imagesDir";

// Setting defaults
var exportOptions = new ExportOptionsPNG24();
var ignoreHiddenLayers = true;
var writeTemplate = false;
var writeJson = false;
var pngScale = 100;
var imagesDir = "./images/";

var tempDoc;
var activeDoc;

try {
	activeDoc = app.activeDocument;
} catch (ignored) {
	activeDoc = null;
}

// --------------------------------
// Main
// --------------------------------

main();

// --------------------------------
// Functions
// --------------------------------

function main() {
	if (!activeDoc) {
		alert("Please open a document before running the LayersToPNG script.");
		return;
	}

	if (activeDoc.path == "") {
		alert("Please save the document before running the LayersToPNG script.");
		return;
	}

	loadXMPLibrary();
	XMPMeta.registerNamespace(L2PNG_NAMESPACE, L2PNG_PREFIX);

	loadSettings();
	showDialog();

	unloadXMPLibrary();
}

// -- Dialog --------------------

function showDialog() {
	var dialog = new Window("dialog", "Spine LayersToPNG");
	dialog.alignChildren = "fill";

	// Output Dirs group
	var outputGroup = dialog.add("panel", undefined, "Output directory");
	outputGroup.orientation = "column";
	outputGroup.alignChildren = "fill";
	outputGroup.margins = [10,17,10,17];
	var imagesDirText = outputGroup.add("edittext", undefined, imagesDir);

	// Scale group
	var scaleGroup = dialog.add("panel", undefined, "PNG scale");
	scaleGroup.orientation = "row";
	scaleGroup.alignChildren = "fill";
	scaleGroup.margins = [10,15,10,15];

	var scaleText = scaleGroup.add("edittext", undefined, pngScale);
	scaleText.characters = 4;

	scaleGroup.add("statictext", undefined, "%");

	var maxScale = getMaxScale();
	var scaleSlider = scaleGroup.add("slider", undefined, pngScale, 0.01, maxScale);
	scaleSlider.alignment = ["fill", ""];

	scaleText.onChange = function () {
		var scaleNumber = Number(scaleText.text);

		if (isNaN(scaleNumber)) {
			scaleNumber = 100;
		} else {
			if (scaleNumber < 0.01) {
				scaleNumber = 0.01;
			} else if (scaleNumber > maxScale) {
				scaleNumber = maxScale
			} else {
				scaleNumber = Math.round(scaleNumber * 100) / 100
			}
		}

		scaleSlider.value = scaleNumber;
		scaleText.text = scaleNumber;
	};

	scaleSlider.onChanging = function () {
		var scaleNumber = Math.round(scaleSlider.value);
		if (scaleNumber < 0.01) scaleNumber = 0.01;
		scaleText.text = scaleNumber;
	};

	// Checkboxes group
	var checkboxGroup = dialog.add("panel", undefined, "Options");
	checkboxGroup.orientation = "row";
	checkboxGroup.alignChildren = "fill";

	var group = checkboxGroup.add("group");
	group.orientation = "column";
	group.alignChildren = "fill";
	group.margins = [0,10,0,5];

	var ignoreHiddenLayersCheckbox = group.add("checkbox", undefined, " Ignore hidden layers");
	ignoreHiddenLayersCheckbox.value = ignoreHiddenLayers;

	group = checkboxGroup.add("group");
	group.orientation = "column";
	group.alignChildren = "fill";
	group.margins = [0,10,0,5];

	var writeTemplateCheckbox = group.add("checkbox", undefined, "Write a template PNG");
	writeTemplateCheckbox.value = writeTemplate;
	var writeJsonCheckbox = group.add("checkbox", undefined, " Write Spine JSON");
	writeJsonCheckbox.value = writeJson;

	// Buttons
	var buttonsGroup = dialog.add("group");
	buttonsGroup.alignment = "center";
	var runButton = buttonsGroup.add("button", undefined, "OK");
	var helpButton = buttonsGroup.add("button", undefined, "Help");
	var cancelButton = buttonsGroup.add("button", undefined, "Cancel");

	cancelButton.onClick = function() {
		dialog.close(0);
	};

	helpButton.onClick = function() {
		alert(
			"- For output dir, begin path with \"./\" to be relative to the AI file.\n" +
			"- To ignore layer explicitly, add the \"[-]\" prefix to the layer name.\n"
		)
	};

	runButton.onClick = function() {
		dialog.close(0);

		var absImagesDirPath = absolutePath(imagesDir);
		var imagesFolder = new Folder(absImagesDirPath);
		imagesFolder.create();

		convertToPNG(absImagesDirPath);

		if (writeTemplate) {
			saveTemplatePNG(absImagesDirPath)
		}

		if (writeJson) {
			var jsonDirPath = activeDoc.path.toString();
			var json = generateJsonText(imagesFolder.getRelativeURI(jsonDirPath));
			saveJsonFile(json, jsonDirPath);
		}
	};

	dialog.onClose = function() {
		updateSettings();
		saveSettings();
	};

	function updateSettings() {
		ignoreHiddenLayers = ignoreHiddenLayersCheckbox.value;
		writeTemplate = writeTemplateCheckbox.value;
		writeJson = writeJsonCheckbox.value;
		pngScale = scaleText.text;
		imagesDir = imagesDirText.text;
	}

	dialog.center();
	dialog.show();
}

// -- Export --------------------

function convertToPNG(absImagesDirPath) {
	tempDoc = app.documents.add(activeDoc.documentColorSpace, activeDoc.width, activeDoc.height);
	tempDoc.artboards[0].artboardRect = activeDoc.artboards[0].artboardRect;

	updateExportOptions();
	saveSubLayersToPNG(activeDoc, absImagesDirPath);

	tempDoc.close(SaveOptions.DONOTSAVECHANGES);
}

function saveSubLayersToPNG(node, path) {
	for (var i = 0; i < node.layers.length; i++) {
		var layer = node.layers[i];

		if (ignoreLayer(layer)) continue;

		if (layer.layers.length > 0) {
			saveSubLayersToPNG(layer, path);
		} else {
			saveLayerToPNG(layer, path);
		}
	}
}

function saveLayerToPNG(layer, path) {
	tempDoc.layers[0].remove();
	var newlayer = tempDoc.layers[0];
	for (var ii = layer.pageItems.length - 1; ii >= 0; ii--) {
		layer.pageItems[ii].duplicate(newlayer, ElementPlacement.PLACEATBEGINNING);
	}
	tempDoc.exportFile(new File(path + "/" + getLayerName(layer) + ".png"), ExportType.PNG24, exportOptions);
}

function updateExportOptions() {
	exportOptions.horizontalScale = pngScale;
	exportOptions.verticalScale = pngScale;
}

// -- Template ------------------------

function saveTemplatePNG(absImagesDirPath) {
	var layerState = {};
	changeLayersForTemplate(activeDoc, layerState, true);
	activeDoc.exportFile(new File(absImagesDirPath + "/template.png"), ExportType.PNG24, exportOptions);
	changeLayersForTemplate(activeDoc, layerState, false);
}

function changeLayersForTemplate(node, layerState, saveState) {
	for (var i = node.layers.length - 1; i >= 0; i--) {
		var layer = node.layers[i];

		if (saveState) {
			layerState[layer.name] = {
				visible: layer.visible,
				locked: layer.locked
			};

			layer.locked = false;
			layer.visible = !ignoreLayer(layer);
		} else {
			layer.visible = layerState[layer.name].visible;
			layer.locked = layerState[layer.name].locked;
		}

		if (layer.layers.length > 0) {
			changeLayersForTemplate(layer, layerState, saveState);
		}
	}
}

// -- JSON ------------------------

function generateJsonText(relImagesDirPath) {
	// deselect all
	activeDoc.selection = null;

	var info = {
		slots: {},
		skinLayers: []
	};

	parseSubLayers(activeDoc, info, "");

	// Output skeleton and bones.
	var json = '{"skeleton":{"images":"' + relImagesDirPath + '"},\n"bones":[{"name":"root"}],\n"slots":[\n';

	// Output slots.
	var slots = info.slots;
	var slotsCount = countAssocArray(slots);
	var slotIndex = 0;
	for (var slotName in slots) {
		if (!slots.hasOwnProperty(slotName)) continue;
		var attachmentName = slotName;
		json += '\t{"name":"' + slotName + '","bone":"root","attachment":"' + attachmentName + '"}';
		slotIndex++;
		json += slotIndex < slotsCount ? ",\n" : "\n";
	}

	// Output skins.
	json += '],\n"skins":{\n\t"default":{\n';

	var skinLayers = info.skinLayers;
	var skinLayersCount = skinLayers.length;
	var skinLayerIndex = 0;

	for (var i = skinLayersCount - 1; i >= 0; i--) {
		var slotName = skinLayers[i];
		var placeholderName = slotName;

		json += '\t\t"' + slotName + '":{"' + placeholderName + '":{'
		+ '"x":' + slots[slotName].x + ',"y":' + slots[slotName].y + ',"width":' + Math.round(slots[slotName].width) + ',"height":' + Math.round(slots[slotName].height) + '}}';

		skinLayerIndex++;
		json += skinLayerIndex < skinLayersCount ? ",\n" : "\n";
	}

	json += '\t\}\n},\n"animations":{"animation":{}}\n}';

	return json;
}

function saveJsonFile(jsonText, jsonDirPath) {
	var name = decodeURI(activeDoc.name);
	name = name.substring(0, name.indexOf("."));
	var file = new File(jsonDirPath + "/" + name + ".json");
	file.remove();
	file.open("w", "TEXT");
	file.lineFeed = "\n";
	file.write(jsonText);
	file.close();
}

function parseSubLayers(node, info, path) {
	for (var i = node.layers.length - 1; i >= 0; i--) {
		var layer = node.layers[i];

		if (ignoreLayer(layer)) continue;

		//var layer = activeDoc.layers[i];
		var wasVisible = layer.visible;
		var wasLocked = layer.locked;

		layer.locked = false;
		layer.visible = true;

		if (layer.layers.length > 0) {
			parseSubLayers(layer, info, path + "/" + layer.name);
		} else {
			parseLayer(layer, info);
		}

		layer.locked = wasLocked;
		layer.visible = wasVisible;
	}
}

function parseLayer(layer, info) {
	var pageItems = layer.pageItems;
	var visibleBounds;

	var left = Number.POSITIVE_INFINITY;
	var top = Number.NEGATIVE_INFINITY;
	var right = Number.NEGATIVE_INFINITY;
	var bottom = Number.POSITIVE_INFINITY;
	
	var found = false;
	
	for (var j = 0; j < pageItems.length; j++ ) { 
		if (!pageItems[j].hidden) {
			visibleBounds = getVisibleBounds(pageItems[j]);
			if (visibleBounds == undefined) continue;

			found = true;

			left = Math.min(visibleBounds[0], left);
			right = Math.max(visibleBounds[2], right);
			top = Math.max(visibleBounds[1], top);
			bottom = Math.min(visibleBounds[3], bottom);
		}
	}
	
	if (found) {
		var layerName = getLayerName(layer);
		info.skinLayers[info.skinLayers.length] = layerName;

		ldata = {};
		ldata.width = (right - left).toFixed(2);
		ldata.height = (top - bottom).toFixed(2);
		ldata.x = (left + (ldata.width/2)).toFixed(2);
		ldata.y = (top - (ldata.height/2)).toFixed(2);

		info.slots[layerName] = ldata;
	}
}

function getVisibleBounds(object) {
	var bounds, clippingItem;
	if (object.typename == "GroupItem") {
		if (object.clipped) {
			for (var i = 0; i < object.pageItems.length; i++) {
				if (object.pageItems[i].hidden) continue;

				if (object.pageItems[i].clipping) {
					clippingItem = object.pageItems[i];
					break;
				} else if (object.pageItems[i].typename == "CompoundPathItem") {
					if (object.pageItems[i].pathItems[0].clipping) {
						clippingItem = object.pageItems[i];
						break;
					}
				} 
			}

			if (clippingItem != undefined) bounds = clippingItem.visibleBounds;
		}

		if (bounds == undefined){
			var subObjectBounds;

			var bounds = [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
			var found = false;
			
			for (var i = 0; i < object.pageItems.length; i++) {
				if (object.pageItems[i].hidden) continue;
				found = true;

				subObjectBounds = getVisibleBounds(object.pageItems[i]);
				bounds[0] = Math.min(bounds[0], subObjectBounds[0]); // Left
				bounds[1] = Math.max(bounds[1], subObjectBounds[1]); // Up
				bounds[2] = Math.max(bounds[2], subObjectBounds[2]); // Right
				bounds[3] = Math.min(bounds[3], subObjectBounds[3]); // Down
			}

			if (!found) bounds = undefined;
		}
	} else
		bounds = object.visibleBounds;

	return bounds;
}

// -- Settings --------------------

function saveSettings() {
	if (loadXMPLibrary()) {
		xmp = new XMPMeta(activeDoc.XMPString);
		xmp.setProperty(L2PNG_NAMESPACE, IGNORE_HIDDEN_LAYERS_ID, ignoreHiddenLayers);
		xmp.setProperty(L2PNG_NAMESPACE, WRITETE_MPLATE_ID, writeTemplate);
		xmp.setProperty(L2PNG_NAMESPACE, WRITETE_JSON_ID, writeJson);
		xmp.setProperty(L2PNG_NAMESPACE, PNG_SCALE_ID, pngScale);
		xmp.setProperty(L2PNG_NAMESPACE, IMAGES_DIR_ID, imagesDir);
		activeDoc.XMPString = xmp.serialize();
	}
}

function loadSettings() {
	if (loadXMPLibrary()) {
		xmp = new XMPMeta(activeDoc.XMPString);

		var property = xmp.getProperty(L2PNG_NAMESPACE, IGNORE_HIDDEN_LAYERS_ID, XMPConst.BOOLEAN);
		if (property) {
			ignoreHiddenLayers = property.value;
		}

		property = xmp.getProperty(L2PNG_NAMESPACE, WRITETE_MPLATE_ID, XMPConst.BOOLEAN);
		if (property) {
			writeTemplate = property.value;
		}

		property = xmp.getProperty(L2PNG_NAMESPACE, WRITETE_JSON_ID, XMPConst.BOOLEAN);
		if (property) {
			writeJson = property.value;
		}

		property = xmp.getProperty(L2PNG_NAMESPACE, PNG_SCALE_ID, XMPConst.NUMBER);
		if (property) {
			pngScale = property.value;
		}

		property = xmp.getProperty(L2PNG_NAMESPACE, IMAGES_DIR_ID, XMPConst.STRING);
		if (property) {
			imagesDir = property.value;
		}
	}
}

function loadXMPLibrary(){
	if ( !ExternalObject.AdobeXMPScript ){
		try{
			ExternalObject.AdobeXMPScript = new ExternalObject('lib:AdobeXMPScript');
		}catch (e){
			alert("Can't load XMP Script Library");
			return false;
		}
	}
	return true;
}

function unloadXMPLibrary(){
	if( ExternalObject.AdobeXMPScript ) {
		try{
			ExternalObject.AdobeXMPScript.unload();
			ExternalObject.AdobeXMPScript = undefined;
		}catch (e){
			alert("Can't unload XMP Script Library");
		}
	}
}

// -- Helpers --------------------

function ignoreLayer(layer) {
	// ignore hidden layers
	if (ignoreHiddenLayers && !layer.visible)
		return true;
	// ignore layer with the [-] prefix
	if (layer.name.search(/^\[\-\]/) != -1)
		return true;

	return false;
}

function absolutePath(path) {
	path = trim(path);
	if (path.length == 0)
		path = activeDoc.path.toString();
	else if (imagesDir.indexOf("./") == 0)
		path = activeDoc.path + path.substring(1);
	path = path.replace(/\\/g, "/");
	if (path.substring(path.length - 1) != "/") path += "/";
	return path;
}

function trim (value) {
	return value.replace(/^\s+|\s+$/g, "");
}

function getMaxScale() {
	var maxDimension = Math.max(activeDoc.width, activeDoc.height);
	var maxScale = 100 * 8192 / maxDimension;
	return Math.floor(maxScale);
}

function endsWith(str, suffix) {
	return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

function stripSuffix(str, suffix) {
	if (endsWith(str.toLowerCase(), suffix.toLowerCase())) str = str.substring(0, str.length - suffix.length);
	return str;
}

function getLayerName(layer) {
	return stripSuffix(trim(layer.name), ".png").replace(/[:\/\\*\?\"\<\>\|]/g, "").replace(/ /g,"_");
}

function countAssocArray(obj) {
	var count = 0;
	for (var key in obj)
		if (obj.hasOwnProperty(key)) count++;
	return count;
}
