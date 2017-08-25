/*
	Export Photoshop to Spine JSON
	Version 2

	based on psd-to-html-exporter.jsx by Uli Hecht
	based on ExportLayerCoordinatesToXML (by pattesdours)
	based on Export Layers To Files - Fast PNG Version (by Naoki Hada)
	based some code from xtools (by XBytor)
*/

#target photoshop
#include "lib/json2.js"

function docCheck() {
	// ensure that there is at least one document open
	if (!documents.length) {
		alert('There are no documents open.');
		return;
	}
}

function getLayerScale( layer ) {
	var layerName = layer.name;
	var scaleStr = layerName.replace(/^([0-9]+)% .*/,"$1");
	var scale = parseFloat(scaleStr) / 100.0;
	return scale != null && !isNaN(scale) ? scale : 1.0;
}

function makeBoneName( layerName ) {
	var name = layerName
		.replace(/^([0-9]+)% /,"")	// Strip off any leading scale percentage
		.replace(/[ :\/\\*\?\"\<\>\|]/g, "_")	// Replace special characters with underscores
		.replace(/\.png$/,"");	// Strip off the .png extension
	return name;
}

function getLayerData(doc, layer, docFileName) {
	doc.activeLayer = layer;
	var imageName = makeBoneName( layer.name );
	var scale = getLayerScale(layer);
	var data = {
		"name":      layer.name,
		"image":     docFileName + "-assets/" + imageName,
		"x":         Math.round(layer.bounds[0].value * 1000) / 1000.0,
		"y":         Math.round(layer.bounds[1].value * 1000) / 1000.0,
		"width":     (layer.bounds[2].value - layer.bounds[0].value) * scale,
		"height":    (layer.bounds[3].value - layer.bounds[1].value) * scale,
		"visible":   layer.visible ? true : false,
		"alpha":     Math.round(layer.opacity)/100.0,
		"blendMode": layer.blendMode.toString().replace(/.*\.(.*)/,"$1").toLowerCase(),
		"scale":     scale
	};
	return data;
}

function getChildren( spineData, parentBoneName ) {
	var children = [];
	var numBones = spineData["bones"].length;
	for (var i = 0; i < numBones; i++ ) {
		var bone = spineData["bones"][i];
		if (bone["parent"] == parentBoneName) {
			children.push( bone );
		}
	}
	return children;
}

function boneRelativeCoordinates( spineData ) {
	var numBones = spineData["bones"].length;
	for (var i = numBones-1; i >= 0; i-- ) {
		var bone = spineData["bones"][i];
		if (bone["name"]!="root") {
			var childBones = getChildren( spineData, bone["name"] );
			if (childBones.length > 0) {
				var bounds = getBounds( spineData, childBones, bone["name"] );
				if (bounds != null) {
					var x = bounds["x"] + (bounds["width"]/2);
					var y = bounds["y"] + (bounds["height"]/2);
					bone["x"] = x;
					bone["y"] = y;
					moveBones( childBones, -x, -y );
				}
			}
		}
	}
}

function moveBones( bones, dx, dy ) {
	var numBones = bones.length;
	for (var i=0; i<numBones; i++) {
		var bone = bones[i];
		bone["x"] += dx;
		bone["y"] += dy;
	}
}

function scaleBones( bones, sx, sy ) {
	var numBones = bones.length;
	for (var i=0; i<numBones; i++) {
		var bone = bones[i];
		bone["x"] *= sx;
		bone["y"] *= sy;
	}
}

// Returns an image attachments data, applying scale to width, height
function getImage( spineData, boneName ) {
	var data = null;
	var numSlots = spineData["slots"].length;
	for (var i=0; i<numSlots; i++) {
		var slot = spineData["slots"][i];
		if (slot["bone"] == boneName) {
			var slotName = slot["name"];
			var attachments = spineData["skins"]["default"][slotName];
			for (var imageName in attachments) {
				data = attachments[imageName];
				if (data.hasOwnProperty["scale"]) {
					data = JSON.parse(JSON.stringify(data));	//clone
					data["width"] /= data["scale"];
					data["height"] /= data["scale"];
				}
			} 
		}
	}
	return data;
}

function getBone( spineData, boneName ) {
	var numBones = spineData["bones"].length;
	for (var i=0; i<numBones; i++) {
		var bone = spineData["bones"][i];
		if (bone["name"] == boneName) {
			return bone;
		}
	}
	return null;
}

function getBounds( spineData, bones, parentName ) {
	var bounds = null;
	var numBones = bones ? bones.length : 0;
	if (numBones > 0) {
		var minX = Number.MAX_VALUE;
		var minY = Number.MAX_VALUE;
		var maxX = Number.MIN_VALUE;
		var maxY = Number.MIN_VALUE;
		var x,y;
		for (var i=0; i<numBones; i++) {
			var bone = bones[i];
			var image = getImage( spineData, bone["name"] );
			if (image) {
				x = bone["x"] + image["x"] - (image["width"]/2);
				if (x < minX) minX = x;
				y = bone["y"] + image["y"] - (image["height"]/2);
				if (y < minY) minY = y;
				x += image["width"];
				if (x > maxX) maxX = x;
				y += image["height"];
				if (y > maxY) maxY = y;
			} else {
				var boneBounds = {"x":0,"y":0,"width":0,"height":0}
				var childBones = getChildren( spineData,bone["name"] );
				if (childBones) {
					boneBounds = getBounds( spineData, childBones, bone["name"] );
				}
				x = bone["x"] + boneBounds["x"];
				if (x < minX) minX = x;
				y = bone["y"] + boneBounds["y"];
				if (y < minY) minY = y;
				x += boneBounds["width"];
				if (x > maxX) maxX = x;
				y += boneBounds["height"];
				if (y > maxY) maxY = y;
			}
		}
		if ( minX != Number.MAX_VALUE) {
			bounds = {
				"x": minX,
				"y": minY,
				"width": maxX - minX,
				"height": maxY - minY
			};
		}
	}
	return bounds;
}

function makeBone( layerName, parentLayerName ) {
	var name = makeBoneName( layerName );
	var parentName = makeBoneName( parentLayerName );
	var bone = {
		"name": name,
		"parent": parentName,
		"x": 0,
		"y": 0
	};
	return bone;
}

function isAdditive( blendMode ) {
	switch (blendMode) {
		case "lighten":
		case "screen":
		case "colordodge":
		case "lineardodge":
		case "lightercolor":
		case "overlay":
		case "softlight":
		case "hardlight":
		case "linearlight":
		case "pinlight":
		case "hardmix":
		case "hue":
		case "color":
			return true;
	}
	return false;
}

processLayers.traverse = function(spineData, doc, layers, docFileName, parentBoneName) {
	for(var i = 1; i <= layers.length; ++i) {
		var index = layers.length - i;
		var layer = layers[index];

		var bone = makeBone( layer.name, parentBoneName );
		if(layer.typename == "LayerSet") {
			bone["name"] += "_group";
			spineData["bones"].push( bone );
			processLayers.traverse(spineData, doc, layer.layers, docFileName, bone["name"]);
		} else if (layer.name.indexOf(".png") != -1) {
			var layerData = getLayerData(doc, layer, docFileName);
			bone["x"] = layerData["x"] + (layerData["width"]/(2*layerData["scale"]));
			bone["y"] = layerData["y"] + (layerData["height"]/(2*layerData["scale"]));
			spineData["bones"].push( bone );
			var slot = {
				"name": bone["name"],
				"bone": bone["name"],
				"attachment": layerData["image"]
			}
			if (layerData["alpha"] != 1.0) {
				slot["color"] = "FFFFFF" + (layerData["alpha"] * 255).toString(16);
			}
			if (isAdditive(layerData["blendMode"])) {
				slot["additive"] = true;
			} else if (layerData["blendMode"] != "normal" && layerData["alpha"] == 1.0) {
				slot["color"] = "FFFFFFCC";
			}
			spineData["slots"].push( slot );
			var skinAttachment = {
				"x": 0,
				"y": 0,
				"width": layerData["width"],
				"height": layerData["height"]
			};
			if (layerData.scale != 1.0) {
				skinAttachment["scaleX"] = skinAttachment["scaleY"] = 1.0 / layerData["scale"];
			}
			var skin = {};
			skin[slot["attachment"]] = skinAttachment;
			spineData["skins"]["default"][slot["name"]] = skin;
		}
	}
};

function processLayers(doc, docFileName) {
	var spineData = {
		"bones": [
			{
				"name": "root",
				"x": 0,
				"y": 0
			}
		],
		"slots": [],
		"skins": {
			"default": {}
		},
		"animations": {
			"animation": {}
		}
	};
	processLayers.traverse(spineData, doc, doc.layers, docFileName, "root");
	boneRelativeCoordinates( spineData );
	scaleBones( spineData["bones"], 1, -1 );
	var rootBones = getChildren( spineData, "root" );
	moveBones( rootBones, -doc.width.as('px') / 2, doc.height.as('px') / 2 );
	delete spineData["bones"][0]["x"];	// Center the root at (0,0)
	delete spineData["bones"][0]["y"];
	return spineData
};

function exportDocument() {
	var originalRulerUnits = preferences.rulerUnits;
	var doc = app.activeDocument;
	var docFileName = doc.name.replace(/[:\/\\*\?\"\<\>\|\s]/g, "_").replace(/\.[a-z]{3}$/,"");
	var fileName = docFileName +"_spine.json";
	var path = doc.fullName.path + "/";

	preferences.rulerUnits = Units.PIXELS;
	
	var spineData = processLayers(doc, docFileName)

	var jsonStr = JSON.stringify( spineData, null, "\t");
	
	var file = new File(path + fileName);
	file.open('w');
	file.writeln(jsonStr);
	file.close();
	
	preferences.rulerUnits = originalRulerUnits;
	
	return file.fullName;
	
}

function main() {
	docCheck();
	
	var path = exportDocument();
	
   alert("Exported JSON successfully to "+ path);
}

main();

