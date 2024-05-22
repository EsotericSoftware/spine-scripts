#target photoshop
app.bringToFront();

// https://github.com/EsotericSoftware/spine-scripts/tree/master/photoshop
// This script saves a copy of an Adobe Photoshop file compatible with the Import PSD functionality of Spine.
// It applies all adjustment layers, clipping masks and layer effects.

// Copyright (c) 2012-2024, Esoteric Software
// All rights reserved.
// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
//     * Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
//     * Neither the name of Esoteric Software nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

var scriptVersion = "1.00"; // This is incremented every time the script is modified, so you know if you have the latest.

var cs2 = parseInt(app.version) < 10, cID = charIDToTypeID, sID = stringIDToTypeID, tID = typeIDToStringID;

var originalDoc, settings, progress, cancel, errors, lastLayerName;
try {
	originalDoc = activeDocument;
} catch (ignored) {}

var defaultSettings = {
	jsonPath: "./",
};
loadSettings();

function run () {
	showProgress();

	errors = [];

    var outputPsdFile = new File(psdPath(settings.jsonPath));
    outputPsdFile.parent.create();
    originalDoc.duplicate();
    deselectLayers();

	try {
		convertToRGB();
	} catch (ignored) {}
	if (activeDocument.mode != DocumentMode.RGB) {
		alert("Please change the image mode to RGB color.");
		return;
	}

	rasterizeAll();
    // it's important to keep this layer otherwise if it's needed to duplicate the original top layer, it will be moved instead.
    var topLayer = activeDocument.artLayers.add();

	// Collect and hide layers.
	var rootLayers = [], layers = [];
	var context = {
		first: hasBackgroundLayer() ? 0 : 1,
		index: getLayerCount(),
		total: 0
	};
    
    var layersWithEffects = {};
    var adjustmentAndClippings = [];
    var toHide = [];
    showProgress("Rasterizing layers...", context.index);
    initializeLayers(context, null, rootLayers, adjustmentAndClippings, layersWithEffects, toHide, [], [], false);
    showProgress("Merging clipping masks and adjustment layers...", adjustmentAndClippings.length);
       
    for (var i = adjustmentAndClippings.length - 1; i >= 0 ; i--) {
        var objectToApply = adjustmentAndClippings[i];
        incrProgress(objectToApply.name);

        // here we have both clipping masks and clipped adjustment layers
        if (objectToApply.clipping) {
            // if a clipping mask applies to a level only, PS provides the command "Merge clipping mask"
            // that we can trigger with rasterizeStyles. So, do this rather than duplicating the clipping mask
            if (objectToApply.layersToApply.length == 1 && objectToApply.parent == objectToApply.layersToApply[0].parent) {          
                //objectToApply.layersToApply[0].rasterize();
                objectToApply.layersToApply[0].mergeClippingMask();
                // consecutive clipping masks are merged as well with the command above, se we discard them
                while (i - 1 >= 0 && objectToApply.prevClipping) {
                    i--;
                    objectToApply = adjustmentAndClippings[i];
                }
                continue;
            }
         }
            
        // Duplicate the clipping mask or adjustment layer for each layer and merge down
        for (var j = 0; j < objectToApply.layersToApply.length; j++) {
            var layer = objectToApply.layersToApply[j];
            if (layersWithEffects[layer.id]) {
                delete layersWithEffects[layer.id];
                layer.rasterizeStyles();
            }
            var duplicate = objectToApply.duplicate();
            duplicate.moveAbove(layer);
            if (objectToApply.clipping) duplicate.setClippingMask(true);
            duplicate.mergeClippingMask();
        }
 
        // Once the cliping mask is applied to all layers, just delete it
        objectToApply.deleteLayer();
    }
    
    // rasterize layer effects where necessary
    for (var id in layersWithEffects) {
         layersWithEffects[id].rasterizeStyles();
    }

    // hide layers that were hidden at the beginning
    for (var i = 0; i < toHide.length; i++) {
        toHide[i].hide();
    }
    
    // delete top layer
    rootLayers[0].deleteLayer();

    activeDocument.saveAs(outputPsdFile, new PhotoshopSaveOptions(), true, Extension.LOWERCASE);
    activeDocument.close(SaveOptions.DONOTSAVECHANGES);
}

function psdPath (path) {
    if (endsWith(path, ".psd")) {
		var index = forwardSlashes(path).lastIndexOf("/");
		if (index != -1) return absolutePath(path.slice(0, index + 1)) + path.slice(index + 1);
		return absolutePath("./") + path;
	}
	var name = decodeURI(originalDoc.name);
	return absolutePath(path) + name.substring(0, name.indexOf(".")) + "-spineCompatible.psd";
}

// Settings dialog:

function showSettingsDialog () {
	if (parseInt(app.version) < 9) {
		alert("Photoshop CS2 or later is required.");
		return;
	}
	if (!originalDoc) {
		alert("Please open a document before running the spine-compatible-psd script.");
		return;
	}
	try {
		decodeURI(activeDocument.path);
	} catch (e) {
		alert("Please save the document before running the spine-compatible-psd script.");
		return;
	}

	// Layout.
	var dialog, group;
	try {
		dialog = new Window("dialog", "spine-compatible-psd v" + scriptVersion);
	} catch (e) {
		throw new Error("\n\nScript is unable to create a Window. Your Photoshop installation may be broken and may need to be reinstalled.\n\n" + e.message);
	}
	dialog.alignChildren = "fill";

	try {
		dialog.add("image", undefined, new File(scriptDir() + "logo.png"));
	} catch (ignored) {}
    
    if (!cs2) {
        group = dialog.add("group");
        var psdPathLabel = group.add("statictext", undefined, "New psd file name:");
        psdPathLabel.justify = "right";
        psdPathLabel.minimumSize.width = 41;
        psdPathText = group.add("edittext", undefined, settings.jsonPath); 
        psdPathText.alignment = ["fill", ""];
    } else {
        dialog.add("statictext", undefined, "JSON:");
        psdPathText = dialog.add("edittext", undefined, settings.jsonPath);
        psdPathText.alignment = "fill";
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
	psdPathText.helpTip = "Compatible PSD file if ending with \".psd\", else the folder to write the PSD file. Begin with \"./\" to be relative to the PSD file - a copy with the original name with the added suffix '-spineCompatible' will be saved.";

	// Events.
	cancelButton.onClick = function () {
		cancel = true;
		dialog.close();
		return;
	};
	if (!cs2) helpButton.onClick = showHelpDialog;
	psdPathText.onChanging = function () {

	};

	// Run now.
	psdPathText.onChanging();

	function updateSettings () {
		settings.jsonPath = psdPathText.text;
	}

	runButton.onClick = function () {
		updateSettings();
		saveSettings();

		psdPathText.enabled = false;
		if (!cs2) helpButton.enabled = false;
		runButton.enabled = false;
		cancelButton.enabled = false;

		try {   
            startTimer()
            run();
            printTimer("Finish");
		} catch (e) {
            if (e.message == "User cancelled the operation") return;
            var layerMessage = lastLayerName ? "[layer " + lastLayerName + "] " : "";
            alert("An unexpected error has occurred:\n\n" + layerMessage + "[line: " + e.line + "] " + e.message
                + "\n\nTo debug, run the script using Adobe ExtendScript with \"Debug > Do not break on guarded exceptions\" unchecked.\n\nv" + scriptVersion);
            debugger;
		} finally {
            if (activeDocument != originalDoc) activeDocument.close(SaveOptions.DONOTSAVECHANGES);
            if (progress && progress.dialog) progress.dialog.close();
            dialog.close();
            printTimer();
		}
	};

	dialog.center();
	dialog.show();
}

function startTimer() {
    $.hiresTimer
}

function printTimer(text) {
    if (text) $.write(text + ": ");
    $.writeln($.hiresTimer / 1000000);
}

function collapseAllgroups() {
    executeAction(stringIDToTypeID("collapseAllGroupsEvent"), new ActionDescriptor(), DialogModes.NO); 
}

function expandAllgroups(parent) {
    for (var setIndex = 0; setIndex < parent.layerSets.length; setIndex++) {
        var ls = parent.layerSets[setIndex];
        if (ls.layers.length > 0) app.activeDocument.activeLayer = ls.layers[0];
        expandAllgroups(ls);
    }
}

function loadSettings () {
	var options;
	try {
		options = app.getCustomOptions("spine-compatible-psd");
	} catch (ignored) {}

	settings = {};
	for (var key in defaultSettings) {
		if (!defaultSettings.hasOwnProperty(key)) continue;
		var typeID = sID(key);
		if (options && options.hasKey(typeID))
			settings[key] = options["get" + getOptionType(defaultSettings[key])](typeID);
		else
			settings[key] = defaultSettings[key];
	}
}

function saveSettings () {
	if (cs2) return; // No putCustomOptions.
	var desc = new ActionDescriptor();
	for (var key in defaultSettings) {
		if (!defaultSettings.hasOwnProperty(key)) continue;
		desc["put" + getOptionType(defaultSettings[key])](sID(key), settings[key]);
	}
	app.putCustomOptions("spine-compatible-psd", desc, true);
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
	var dialog = new Window("dialog", "spine-compatible-psd - Help");
	dialog.alignChildren = ["fill", ""];
	dialog.orientation = "column";
	dialog.alignment = ["", "top"];
	var helpText = dialog.add("statictext", undefined, ""
        + "This script saves a copy of an Adobe Photoshop file compatible with the Import PSD functionality of Spine.\n"
        + "It applies all adjustment layers, clipping masks and layer effects.\n"
        + "\n"
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

function showProgress (title, total) {
	title = title ? "spine-compatible-psd - " + title : "spine-compatible-psd";
	if (!progress) {
		var dialog = new Window("palette", title);
		dialog.alignChildren = "fill";
		dialog.orientation = "column";

		var message = dialog.add("statictext", undefined, "Initializing...");

		var group = dialog.add("group");
			var bar = group.add("progressbar");
			bar.preferredSize = [300, 16];
			bar.maxvalue = total;
			bar.value = 1;
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
	} else {
		progress.dialog.text = title;
		progress.bar.maxvalue = total;
	}
	progress.count = 0;
	progress.total = total;
	progress.updateTime = 0;
	var reset = $.hiresTimer;
}

function incrProgress (layerName) {
	lastLayerName = trim(layerName);
	progress.count++;
	if (progress.count != 1 && progress.count < progress.total) {
		progress.updateTime += $.hiresTimer;
		if (progress.updateTime < 500000) return;
		progress.updateTime = 0;
	}
	progress.bar.value = progress.count;
	progress.message.text = progress.count + " / "+ progress.total + ": " + lastLayerName;
	if (!progress.dialog.active) progress.dialog.active = true;
}

// spine-compatible-psd utility:

function initializeLayers (context, parent, parentLayers, adjustmentAndClippings, layersWithEffects, toHide, adjustmentStack, clippingStack, prevClipping) {
	while (context.index >= context.first) {
		if (cancel) return -1;

		var id = getLayerID(context.index--);
         var layer = new Layer(id, parent, false);
         incrProgress(layer.name);
         
         // if a layer is not visible, make it visible to apply effects on, but store to hide it later
         if (!layer.visible && !layer.isGroupEnd) {
            layer.show();
            toHide.push(layer);
         };
         
         if (layer.adjustment && !layer.clipping) {
            if (layer.has("layerEffects")) layer.rasterizeStyles();
            layer.layersToApply = [];
            adjustmentStack.push(layer);
            adjustmentAndClippings.push(layer);
            prevClipping = false;
            continue;
         } else if (layer.clipping) {
             if (layer.has("layerEffects")) layer.rasterizeStyles();
             layer.layersToApply = [];
             layer.prevClipping = prevClipping;
             clippingStack.push(layer);
             adjustmentAndClippings.push(layer);
             prevClipping = true;
             continue;
         } else if (layer.isGroup) {
             if (prevClipping) {
                for (var i = clippingStack.length - 1; i >= 0; i--) {
                    var clippingInfo = clippingStack[i];
                    clippingInfo.groupId = layer.id;
                    if (!clippingInfo.prevClipping) break;
                }
             } 
         } else  if (layer.isGroupEnd) {
             for (var i = clippingStack.length - 1; i >= 0; i--) {
                var clippingInfo = clippingStack[i];
                if (clippingInfo.groupId === parent.id) {
                    clippingStack.pop();
                    if (!clippingInfo.prevClipping) break;
                }
            }
        
            for (var i = adjustmentStack.length - 1; parent.blendMode != "passThrough" && i >= 0; i--) {
                var adjustmentInfo = adjustmentStack[i];
                var ancestor = adjustmentInfo.parent;
                while (ancestor != null) {
                    if (ancestor.id === parent.id) {
                        adjustmentStack.pop();
                        break;
                    }
                    ancestor = ancestor.parent;
                }
                
            }  
         } else {
            if (layer.has("layerEffects")) layersWithEffects[layer.id] = layer;
            for (var i = clippingStack.length - 1; i >= 0; i--) {
                clippingStack[i].layersToApply.push(layer);  
            }
            if (prevClipping) {
                for (var i = clippingStack.length - 1; i >= 0; i--) {
                    var clippingInfo = clippingStack.pop();
                    if (!clippingInfo.prevClipping) break;
                }    
            }
        
            for (var i = adjustmentStack.length - 1; i >= 0; i--) {
                adjustmentStack[i].layersToApply.push(layer);  
            }
         }
         prevClipping = false;

		if (layer.isGroupEnd) break;
		context.total++;
		parentLayers.push(layer);
		if (layer.isGroup) initializeLayers(context, layer, layer.layers, adjustmentAndClippings, layersWithEffects, toHide, adjustmentStack, clippingStack, prevClipping);
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
	var key = cID("Rlr" + axis);
	var ref = new ActionReference();
	ref.putProperty(cID("Prpr"), key);
	ref.putEnumerated(cID("Dcmn"), cID("Ordn"), cID("Trgt")); 
	return executeActionGet(ref).getInteger(key) >> 16;
}

// Seems to not be available when the document has >= 500 layers.
function rasterizeAll () {
	try {
		executeAction(sID("rasterizeAll"), undefined, DialogModes.NO);
	} catch (ignored) {}
}

// Layer must be selected.
function newLayerBelow (name) {
	var ref = new ActionReference();
	ref.putClass(cID("Lyr "));
	var desc2 = new ActionDescriptor();
	desc2.putString(cID("Nm  "), name);
	var desc1 = new ActionDescriptor();
	desc1.putReference(cID("null"), ref);
	desc1.putBoolean(sID("below"), true);
	desc1.putObject(cID("Usng"), cID("Lyr "), desc2);
	executeAction(cID("Mk  "), desc1, DialogModes.NO);
}

// Layer must be selected.
function merge () {
	executeAction(cID("Mrg2"), undefined, DialogModes.NO);
}

function scriptDir () {
	var file;
	if (!cs2)
		file = $.fileName;
	else {
		try {
			var error = THROW_ERROR; // Force error which provides the script file name.
		} catch (e) {
			file = e.fileName;
		}
	}
	return new File(file).parent + "/";
}

function absolutePath (path) {
	path = forwardSlashes(trim(path));
	if (path.length == 0) return forwardSlashes(decodeURI(activeDocument.path)) + "/"; // PSD folder.
	if (/^(\/|~|[A-Za-z]:)/.test(path)) return forwardSlashes(decodeURI(new File(path).fsName)) + "/"; // Absolute.
	if (startsWith(path, "./")) path = path.substring(2);
	return forwardSlashes(decodeURI(new File(activeDocument.path + "/" + path).fsName)) + "/"; // Relative to PSD folder.
}

function deselectLayers () {
	var ref = new ActionReference();
	ref.putEnumerated(cID("Lyr "), cID("Ordn"), cID("Trgt"));
	var desc = new ActionDescriptor();
	desc.putReference(cID("null"), ref);
	try {
		executeAction(sID("selectNoLayers"), desc, DialogModes.NO);
	} catch (ignored) {} // Fails if only background layer.
}

function convertToRGB () {
	var desc = new ActionDescriptor();
	desc.putClass(cID("T   "), cID("RGBM"));
	desc.putBoolean(cID("Mrge"), false);
	desc.putBoolean(cID("Rstr"), true);
	executeAction(cID("CnvM"), desc, DialogModes.NO);
}

function deleteDocumentAncestorsMetadata () {
	if (ExternalObject.AdobeXMPScript == undefined) ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
	app.activeDocument.xmpMetadata.rawData = new XMPMeta().serialize();
}

function getLayerCount () {
	var ref = new ActionReference();
	ref.putProperty(cID("Prpr"), sID("numberOfLayers"));
	ref.putEnumerated(cID("Dcmn"), cID("Ordn"), cID("Trgt"));
	return executeActionGet(ref).getInteger(sID("numberOfLayers"));
}

function getLayerID (index) {
	var ref = new ActionReference();
	ref.putProperty(cID("Prpr"), sID("layerID"));
	ref.putIndex(cID("Lyr "), index);
	return executeActionGet(ref).getInteger(sID("layerID"));
}

function hasBackgroundLayer () {
   try {
      var ref = new ActionReference(); 
      ref.putProperty(cID("Prpr"), sID("hasBackgroundLayer")); 
      ref.putEnumerated(cID("Dcmn"), cID("Ordn"), cID("Trgt"));
      return executeActionGet(ref).getBoolean(sID("hasBackgroundLayer"));
   } catch (e) { // CS2.
      try {
         return activeDocument.backgroundLayer;
      } catch (ignored) {
      }
      return false;
   }
}

function typeToMethod (type) {
	if (type == "DescValueType.ENUMERATEDTYPE") return "EnumerationValue";
	if (type == "DescValueType.OBJECTTYPE") return "ObjectValue";
	if (type == "DescValueType.UNITDOUBLE") return "Double";
	if (type == "DescValueType.INTEGERTYPE") return "Integer";
	if (type == "DescValueType.STRINGTYPE") return "String";
	if (type == "DescValueType.BOOLEANTYPE") return "Boolean";
	if (type == "DescValueType.LISTTYPE") return "List";
	if (type == "DescValueType.REFERENCETYPE") return "Reference";
	throw new Error("Unknown type: " + type);
}

// Example:
//	var ref = new ActionReference();
//	ref.putIdentifier(cID("Lyr "), layer.id);
//	alert(properties(executeActionGet(ref)));
function properties (object, indent) {
	if (!indent) indent = 0;
	var text = "";
	for (var i = 0, n = object.count; i < n; i++) {
		var key = object.getKey(i);
		var type = typeToMethod(object.getType(key));
		var value = object["get" + type](key);
		if (type == "EnumerationValue") value = tID(value);
		else if (type == "ObjectValue") value = "{\n" + properties(value, indent + 1) + "}";
		else if (type == "List") {
			var items = "";
			for (var ii = 0, nn = value.count; ii < nn; ii++) {
				var itemType = typeToMethod(value.getType(ii));
				items += properties(value["get" + itemType](ii), indent + 1);
			}
			if (items) items = "\n" + items;
			value = "[" + items + "]";
		}
		for (var ii = 0; ii < indent; ii++)
			text += "  ";
		text += tID(key) + ": " + value + " (" + type + ")\n";
	}
	return text;
}

// Layer class.

function Layer (id, parent, selected) {
	this.id = id;
	this.parent = parent;
	this.selected = selected;

	this.name = this.get("name", "String");

	var type = tID(this.get("layerSection", "EnumerationValue"));
	this.isGroupEnd = type == "layerSectionEnd";
	if (this.isGroupEnd) return;
	this.isGroup = type == "layerSectionStart";
	this.isLayer = type == "layerSectionContent";

	this.visible = this.get("visible", "Boolean");
	this.background = this.get("background", "Boolean");
	this.locked = this.get("layerLocking", "ObjectValue").getBoolean(sID("protectAll"));
	this.blendMode = tID(this.get("mode", "EnumerationValue"));
	this.clipping = this.get("group", "Boolean");

	this.mask = this.get("hasUserMask", "Boolean", function () {
		return false; // CS2.
	});

	this.adjustment = this.get("layerKind", "Integer", function () {
		return 0;
	}) == 2/*kAdjustmentSheet*/;

	this.boundsDirty = true;
	if (this.isGroup) this.layers = [];
}

Layer.prototype.get = function (name, type, error) {
	var property = sID(name);
	var ref = new ActionReference();
	ref.putProperty(cID("Prpr"), property);
	ref.putIdentifier(cID("Lyr "), this.id);
	try {
		return executeActionGet(ref)["get" + type](property);
	} catch (e) {
		if (error) return error();
		e.message = "Unable to get layer " + this + " property: " + name + "\n" + e.message;
		throw e;
	}
};

Layer.prototype.has = function (name) {
	var property = sID(name);
	var ref = new ActionReference();
	ref.putProperty(cID("Prpr"), property);
	ref.putIdentifier(cID("Lyr "), this.id);
	try {
		return executeActionGet(ref).hasKey(property);
	} catch (ignored) {}
	return false;
};

Layer.prototype.getIndex = function () {
	return this.get("itemIndex", "Integer");
};

Layer.prototype.isNormal = function () {
	var layer = this;
	return this.get("layerKind", "Integer", function () {
		return layer.has("smartObject") ? 5/*kSmartObjectSheet*/ : 1/*kPixelSheet*/;
	}) == 1/*kPixelSheet*/;
};

Layer.prototype.setClippingMask = function (clipping) {
	var ref = new ActionReference();
	ref.putIdentifier(cID("Lyr "), this.id);
	var desc = new ActionDescriptor();
	desc.putReference(cID("null"), ref);
	try {
		executeAction(cID(clipping ? "GrpL" : "Ungr"), desc, DialogModes.NO);
	} catch (ignored) {} // Fails if already in the desired state.
};

Layer.prototype.setVisible = function (visible) {
	if (this.visible == visible) return;
	this.visible = visible;
	var ref = new ActionReference();
	ref.putIdentifier(cID("Lyr "), this.id);
	var desc = new ActionDescriptor();
	desc.putReference(cID("null"), ref);
	executeAction(cID(visible ? "Shw " : "Hd  "), desc, DialogModes.NO);
};

Layer.prototype.hide = function () {
	this.setVisible(false);
};

Layer.prototype.show = function () {
	this.setVisible(true);
};

Layer.prototype.setLocked = function (locked) {
	if (this.locked == locked) return;
	this.locked = locked;
	var desc1 = new ActionDescriptor();
	var ref = new ActionReference();
	ref.putIdentifier(cID("Lyr "), this.id);
	desc1.putReference(cID("null"), ref);
	var desc2 = new ActionDescriptor();
	desc2.putBoolean(sID("protectNone"), true);
	desc1.putObject(sID("layerLocking"), sID("layerLocking"), desc2);
	executeAction(sID("applyLocking"), desc1, DialogModes.NO);
};

Layer.prototype.unlock = function () {
	this.setLocked(false);
	if (!this.layers) return;
	for (var i = this.layers.length - 1; i >= 0; i--)
		this.layers[i].unlock();
};

Layer.prototype.moveAbove = function (otherLayer) {
	var ref1 = new ActionReference();
	ref1.putIdentifier(cID("Lyr "), this.id);
	var ref2 = new ActionReference();
	ref2.putIndex(cID("Lyr "), otherLayer.getIndex());
	var desc = new ActionDescriptor();
	desc.putReference(cID("null"), ref1);
	desc.putReference(cID("T   "), ref2);
	desc.putBoolean(cID("Adjs"), false);
	executeAction(cID("move"), desc, DialogModes.NO);
};

Layer.prototype.deleteLayer = function () {
	this.unlock();
	var ref = new ActionReference();
	ref.putIdentifier(cID("Lyr "), this.id);
	var desc = new ActionDescriptor();
	desc.putReference(cID("null"), ref);
    try {
		executeAction(cID("Dlt "), desc, DialogModes.NO);
	} catch (ignored) {}
};

Layer.prototype.rasterize = function () {
	var ref = new ActionReference();
	ref.putIdentifier(cID("Lyr "), this.id);
	var desc = new ActionDescriptor();
	desc.putReference(cID("null"), ref);
	executeAction(sID("rasterizeLayer"), desc, DialogModes.NO);
};

Layer.prototype.duplicate = function () {
    var ref = new ActionReference();
	ref.putIdentifier(cID("Lyr "), this.id);
	var desc = new ActionDescriptor();
	desc.putReference(cID("null"), ref);
    var idNm = charIDToTypeID( "Nm  " );
    desc.putString( idNm, """copy""" );
    executeAction( charIDToTypeID( "Dplc" ), desc, DialogModes.NO );
    return new Layer(app.activeDocument.activeLayer.id, null, true);
};

Layer.prototype.mergeClippingMask = function () {
	this.select();
	try {
		merge(); // Merges any clipping masks.
	} catch (ignored) {}
}

Layer.prototype.rasterizeStyles = function () {   
     if (this.has("layerEffects")) {
        this.select();
        newLayerBelow(this.name);
        this.select(true);
        merge();
        this.boundsDirty = true;
     };

	// Rasterizing styles may not give the desired results in all cases, merge does.
	//var ref = new ActionReference();
	//ref.putProperty(cID("Prpr"), sID("layerEffects"));
	//ref.putIdentifier(cID("Lyr "), this.id);
	//if (executeActionGet(ref).hasKey(sID("layerEffects"))) {
	//	var desc = new ActionDescriptor();
	//	desc.putReference(cID("null"), ref);
	//	desc.putEnumerated(cID("What"), sID("rasterizeItem"), sID("layerStyle"));
	//	executeAction(sID("rasterizeLayer"), desc, DialogModes.NO);
	//}
};

Layer.prototype.select = function (add) {
	var ref = new ActionReference();
	ref.putIdentifier(cID("Lyr "), this.id);
	var desc = new ActionDescriptor();
	desc.putReference(cID("null"), ref);
	if (add) desc.putEnumerated(sID("selectionModifier"), sID("selectionModifierType"), sID("addToSelection"));
	desc.putBoolean(cID("MkVs"), false);
	executeAction(cID("slct"), desc, DialogModes.NO);
};

Layer.prototype.path = function (path) {
	var layer = this;
	var path = layer.name;
	while (true) {
		layer = layer.parent;
		if (!layer) return path;
		path = layer.name + "/" + path;
	}
};

Layer.prototype.toString = function () {
	return this.name ? this.path() : this.id;
};

// JavaScript utility:

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

function indexOf (array, value) {
	for (var i = 0, n = array.length; i < n; i++)
		if (array[i] == value) return i;
	return -1;
}

function trim (value) {
	return value.replace(/^\s+|\s+$/g, "");
}

function startsWith (str, prefix) {
	return str.indexOf(prefix) === 0;
}

function endsWith (str, suffix) {
	return !(str.indexOf(suffix, str.length - suffix.length) === -1);
}

function quote (value) {
	return '"' + value.replace(/"/g, '\\"') + '"';
}

function forwardSlashes (path) {
	return path.replace(/\\/g, "/");
}

showSettingsDialog();
