{
/*
	Export After Effects to Spine JSON
	Version 44

	Script for exporting After Effects animations as Spine JSON.
	For use with Spine from Esoteric Software.

	Copyright (c) 2014 Nimai Malle <nimai@beecavegames.com>

	Portions Copyright (c) 2012 Cole Reed <info@auralgrey.com>
	Derived from AE2JSON v0.5 https://github.com/ichabodcole/AE2JSON.git
*/

    #include "lib/underscore.js"
	#include "lib/json2.js"
	#include "lib/utilities.js"
    
    var mainSettings = {
        render : {
            
        }
    }
    
	// Returns the class name of the argument or undefined if it's not a valid JavaScript object.
	function getObjectClass(obj) {
		if (obj && obj.constructor && obj.constructor.toString) {
			var arr = obj.constructor.toString().match(/function\s*(\w+)/);
			if (arr && arr.length == 2) {
				return arr[1];
			}
		}
		return undefined;
	}

	function sqr(x) { return x * x; }
	function dist2(v, w) { return sqr(v[0] - w[0]) + sqr(v[1] - w[1]); }
	function dist(v, w) { return Math.sqrt(sqr(v[0] - w[0]) + sqr(v[1] - w[1])); }
	function distToSegmentSquared(p, v, w) {
		var l2 = dist2(v, w);
		if (l2 == 0) return dist2(p, v);
		var t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;
		if (t < 0) return dist2(p, v);
		if (t > 1) return dist2(p, w);
		return dist2(p, [
			v[0] + t * (w[0] - v[0]),
			v[1] + t * (w[1] - v[1])
		]);
	}
	function distToSegment(p, v, w) { return Math.sqrt(distToSegmentSquared(p, v, w)); }

	function equals(valueA, valueB){
		var result = true;
		if (valueA instanceof Array ) {
			if (!(valueB instanceof Array) || valueA.length != valueB.length) {
				result = false;
			} else {
				for (var i=0; i<valueA.length && result; i++) {
					result = equals( valueA[i], valueB[i] );
				}
			}
		} else {
			result = (valueA == valueB);
		}
		return result;
	}

	if (typeof Array.prototype.indexOf != "function") {
		Array.prototype.indexOf = function (el) {
			var len = this.length;
			for(var i = 0; i < len; i++) if(el === this[i]) return i;
			return -1;
		}
	}

	function AE2JSON(thisObj,saveToFile) {
        
        // Initialize useful things
        this.layerRenderQueueItems = [];
        
		var numSelected = app.project.selection.length;
		this.numCompsSelected = 0;
		for (var i=0; i<numSelected; i++) {
			var rootItem = app.project.selection[i];
			if (rootItem instanceof CompItem) {
				this.numCompsSelected++;
			}
		}
		if (this.numCompsSelected > 0) {
			this.animationName = "animation";
			if (this.showInitialDialog()) {
				var orgTimeDisplayType = app.project.timeDisplayType;
				app.project.timeDisplayType = TimeDisplayType.FRAMES;
				this.spineData = [];
				for (var i=0; i<numSelected; i++) {
					var rootItem = app.project.selection[i];
					if (rootItem instanceof CompItem) {
						var compName = rootItem.name;
						if (numSelected > 1) {
							this.animationName = compName;
						}
						this.resetCompositions();
						this.initializeCompositions(rootItem);
						this.progressWindow = new Window("palette","Export Spine",undefined,{"closeButton":false});
						this.progressBar = this.progressWindow.add("progressbar",undefined,0,this.numLayers);
						this.progressWindow.show();
						var spineData = this.processCompositions();
						this.spineData.push( spineData );
					}
				}

				this.jsonData = this.combineSpineData( this.spineData );

				app.project.timeDisplayType = orgTimeDisplayType;

				this.renderJSON(saveToFile);

				this.progressWindow.close();
				this.showCompleteDialog();
			}
		} else {
			alert( "No Compositions Selected.\nPlease select at least one Composition in the project.");
		}
	}

	AE2JSON.prototype.combineSpineData = function(spineData){
		var numSpines = spineData.length;
		if (numSpines > 1) {
			var firstAnimName = this.getAnimationName(spineData[0]);
			this.addAnimationNameToSkin(spineData[0]["skins"]["default"],firstAnimName);
			for (var i=1; i<numSpines; i++) {
				var boneData = spineData[i]["bones"];
				spineData[0]["bones"] = this.mergeByName( spineData[0]["bones"], spineData[i]["bones"] );
				spineData[0]["slots"] = this.mergeByName( spineData[0]["slots"], spineData[i]["slots"] );
				var animName = this.getAnimationName(spineData[i]);
				this.addAnimationNameToSkin( spineData[i]["skins"]["default"], animName );
				this.mergeSkins( spineData[0]["skins"]["default"], firstAnimName,
					spineData[i]["skins"]["default"], animName);
				spineData[0]["animations"][animName] = spineData[i]["animations"][animName];
			}
			var animations = spineData[0]["animations"];
			var skins = spineData[0]["skins"]["default"];
			for (var slotName in skins) {
				for (var texName in skins[slotName]) {
					var animNames = skins[slotName][texName]["_anim"];
					for (var animName in animations) {
						var slotsAnim = animations[animName]["slots"];
						if (!slotsAnim.hasOwnProperty(slotName)) {
							slotsAnim[slotName] = {};
						}
						if (!slotsAnim[slotName].hasOwnProperty("attachment")) {
							slotsAnim[slotName]["attachment"] = [];
						}
						var slotData = this.findByName(spineData[0]["slots"],slotName);
						var slotTexName = slotData.hasOwnProperty("attachment") ? slotData["attachment"] : null;
						if (animNames.indexOf(animName) == -1) {
							if (slotsAnim[slotName]["attachment"].length==0 || slotsAnim[slotName]["attachment"][0]["name"]!=null) {
								slotsAnim[slotName]["attachment"].unshift( { "time": 0, "name": null } );
							}
						} else {
							if (slotsAnim[slotName]["attachment"].length==0 || slotsAnim[slotName]["attachment"][0]["name"]!=slotTexName) {
								slotsAnim[slotName]["attachment"] = [ { "time": 0, "name": texName } ];
							} else if (slotsAnim[slotName]["attachment"].length>0 && slotsAnim[slotName]["attachment"][0]["name"]!=null && slotsAnim[slotName]["attachment"][0]["time"]>0) {
								slotsAnim[slotName]["attachment"].unshift( { "time": 0, "name": null } );
							}
						}
					}
				}
			}
			this.removeAnimationNamesFromSkin(skins);
		}
		return spineData[0];
	}

	AE2JSON.prototype.getAnimationName = function(spineData){
		var name;
		for (name in spineData["animations"]) {
			break;
		}
		return name;
	}

	AE2JSON.prototype.removeAnimationNamesFromSkin = function(skin){
		for (var name in skin) {
			for (var tex in skin[name]) {
				delete skin[name][tex]["_anim"];
			}
		}
	}

	AE2JSON.prototype.addAnimationNameToSkin = function(skin,animName){
		for (var name in skin) {
			for (var tex in skin[name]) {
				if (skin[name][tex].hasOwnProperty("_anim") == false) {
					skin[name][tex]["_anim"] = [animName]
				} else if (skin[name][tex]["_anim"].indexOf(animName) == -1) {
					skin[name][tex]["_anim"].push(animName);
				}
			}
		}
	}

	AE2JSON.prototype.mergeSkins = function(skin1,animName1,skin2,animName2){
		for (var name in skin2) {
			if (skin1.hasOwnProperty(name) == false) {
				skin1[name] = skin2[name];
			} else {
				for (var tex in skin2[name]) {
					if (skin1[name].hasOwnProperty(tex) == false) {
						skin1[name][tex] = skin2[name][tex];
					} else {
						skin1[name][tex]["_anim"] = skin1[name][tex]["_anim"].concat(skin2[name][tex]["_anim"]);
					}
				}
			}
		}
		return skin1;
	}

	AE2JSON.prototype.mergeByName = function(array1,array2){
		var i=0;
		var j=0;
		var result=[];
		var l1=array1.length;
		var l2=array2.length;
		while (i<l1 || j<l2) {
			if (i<l1) {
				if (this.findByName(result,array1[i]["name"])==null) {
					result.push( array1[i] );
				}
				i++;
			}
			if (j<l2) {
				if (this.findByName(result,array2[j]["name"])==null) {
					result.push( array2[j] );
				}
				j++;
			}
		}
		return result;
	}

	AE2JSON.prototype.findByName = function(array,name){
		for (var i=0;i<array.length;i++) {
			if (array[i]["name"] == name) {
				return array[i];
			}
		}
		return null;
	}

	AE2JSON.prototype.showInitialDialog = function(){
		var w = new Window("dialog","Export Spine",undefined,{"closeButton":false});
		var group, label;
		group = w.add("group");
		label = group.add("statictext",undefined,"Spacial Tollerance:");
		var slider = group.add("slider {minValue: 0, maxValue: 100, value:100}");
		group.helpTip = label.helpTip = slider.helpTip = "Keep all the way to the right to never create intermediate keyframes.\nSlide all the way left to create a keyframe every frame.\nIterim values set the tolerance for generating keyframes on bezier movement paths.\nKeep an eye on the total number of keyframes output."
		group = w.add("group");
		label = group.add("statictext",undefined,"Filename Suffix:");
		var suffix = group.add("edittext",undefined,"_spine");
		suffix.characters = 10;
		group = w.add ("group");
		group.add ("button", undefined, "Export", {name: "ok"});
		group.add ("button", undefined, "Cancel");
		if (w.show() != 1) {
			return false;
		}
		this.spatialTolerance = (slider.value == slider.maxValue) ? 999 : ((slider.value/slider.maxValue)/10.0);
		this.filenameSuffix = suffix.text;
		return true;
	}

	AE2JSON.prototype.progress = function(){
        return;
		
         var progress = ++this.progressBar.value;
		//this.progressWindow.close();
		//this.progressWindow = new Window("palette","Export Spine",undefined,{"closeButton":false});
		//this.progressBar = this.progressWindow.add("progressbar",undefined,progress,this.numLayers);
		//this.progressWindow.show();
	}

	AE2JSON.prototype.showCompleteDialog = function(){
		var w = new Window("dialog","Export Spine",undefined,{"closeButton":false});
		w.add("statictext",undefined,this.outputFilename);
		this.computeStats();
		w.add("statictext",undefined,"Bones: "+this.totalBones);
		w.add("statictext",undefined,"Keyframes: "+this.totalKeyframes);
		w.add ("button", undefined, "OK", {name: "ok"});
		w.show();
	}

	AE2JSON.prototype.computeStats = function(){
		this.totalBones = this.jsonData["bones"].length;
		this.totalKeyframes = this.countKeyframes( this.jsonData["animations"] );
	}

	AE2JSON.prototype.resetCompositions = function(){
		this.proj = app.project;
		var projName = app.project.file.name;
		this.projName = projName.substring(projName.lastIndexOf('/')+1).split('.')[0];
		this.numLayers = 0;
		this.totalBones = 0;
		this.totalKeyframes = 0;
		this.referencedComps = [];
		this.compData = {};
	}

	AE2JSON.prototype.initializeCompositions = function(rootItem){
		this.masterComp = rootItem;
		this.activeComp = rootItem.name;
		var i = this.referencedComps.length;
		this.referencedComps.push(rootItem);
		while (i < this.referencedComps.length) {
			var comp = this.referencedComps[i];
			if (!this.compData[comp.name]) {
				this.jsonData = {};
				this.jsonData.projectSettings = {};
				this.jsonData.composition = {};
				this.jsonData.composition.compSettings = new CompSettings(comp);
				this.jsonData.composition.layers = [];
                 this.jsonData.composition.layerLookup = [];
				this.doCompLayers(comp);
				this.compData[comp.name] = this.jsonData;
				this.numLayers += this.compData[comp.name].composition.layers.length;
			}
			this.numLayers += this.compData[comp.name].composition.layers.length;
			i++;
		}
	}

	AE2JSON.prototype.processCompositions = function(){
		for (var compName in this.compData) {
			this.jsonData = this.compData[compName];
			this.compData[compName] = this.generateSpineData();
		}

		this.jsonData = this.compData[this.activeComp];
		this.combineCompositions();
		this.processFlips();
		return this.jsonData;
	}

	AE2JSON.prototype.processFlips = function(boneName){
		if (boneName == undefined) {
			boneName = "root";
		}
		var bone = this.getBone(boneName);
		var flipX = bone.hasOwnProperty("scaleX") && (bone["scaleX"] < 0);
		var flipY = bone.hasOwnProperty("scaleY") && (bone["scaleY"] < 0);
		var animation = this.getBoneAnimation(boneName);
		if (animation && animation.hasOwnProperty("scale")) {
			var scaleAnim = animation["scale"];
			if (scaleAnim.length > 0) {
				flipX = scaleAnim[0]["x"] < 0;
				flipY = scaleAnim[0]["y"] < 0;
			}
		}
		var children = this.getAllChildBones(boneName);
		if (flipX != flipY) {
			this.flipBone(bone,flipX,flipY);
			if (children) {
				for (var i=0; i<children.length; i++) {
					this.flipBone( children[i], flipX, flipY );
				}
			}
		}
		if (children) {
			for (var i=0; i<children.length; i++) {
				this.processFlips(children[i]["name"]);
			}
		}
	}

	AE2JSON.prototype.flipBone = function(bone,flipX,flipY){
		if (bone.hasOwnProperty("rotation") == false) {
			bone["rotation"] = 0.0;
		}
		this.flipRotations(bone,flipX,flipY)
		var animation = this.getBoneAnimation(bone["name"]);
		if (animation) {
			this.flipRotations(animation,flipX,flipY);
		}

		if (bone["rotation"] == 0.0) {
			delete bone["rotation"];
		}
	}

	AE2JSON.prototype.flipRotations = function(animEntry,flipX,flipY){
		for (var prop in animEntry) {
			if (animEntry[prop] instanceof Array ) {
				var len = animEntry[prop].length;
				if (len > 0 && animEntry[prop][0].hasOwnProperty("angle") ) {
					for (i=0; i<len; i++) {
						animEntry[prop][i]["angle"] = this.flipRotation( animEntry[prop][i]["angle"], flipX, flipY );
					}
				}
			} else if (prop == "rotation") {
				animEntry["rotation"] = this.flipRotation( animEntry["rotation"], flipX, flipY );
			} else if (animEntry[prop] && typeof animEntry[prop] == "object" ) {
				this.flipRotations( animEntry[prop], flipX, flipY );
			}
		}
	}

	AE2JSON.prototype.flipRotation = function(angle,flipX,flipY){
		var newAngle = angle;
		if (flipX != flipY) {
			newAngle = (360 - angle) % 360;
		}
		return newAngle;
	}

	AE2JSON.prototype.getBoneAnimation = function(boneName){
		var animation = this.jsonData["animations"][this.animationName]["bones"];
		if (animation.hasOwnProperty(boneName)) {
			return animation[boneName];
		} else {
			return null;
		}
	}

	AE2JSON.prototype.getBone = function(boneName){
		for (var i=0; i<this.jsonData.bones.length; i++) {
			var bone = this.jsonData.bones[i];
			if (bone["name"] == boneName) {
				return bone;
			}
		}
		return null;
	}

	AE2JSON.prototype.getAllChildBones = function(parentBoneName, bones){
		if (bones == undefined) {
			bones = [];
		}
		for (var i=0; i<this.jsonData.bones.length; i++) {
			var bone = this.jsonData.bones[i];
			if (bone.hasOwnProperty("parent") && bone["parent"] == parentBoneName) {
				bones.push(bone);
				this.getAllChildBones( bone["name"], bones );
			}
		}
		return bones;
	}

	AE2JSON.prototype.combineCompositions = function(){
		var masterDuration = this.masterComp.duration;
		var animation = this.jsonData["animations"][this.animationName];
		var i=0;
		while (i < this.jsonData.bones.length) {
			this.progress();
			if (this.jsonData.bones[i].hasOwnProperty("comp")) {
				var bone = this.jsonData.bones[i];
				var boneName = bone["name"];
				var compName = bone["comp"];
				var compData = this.compData[ compName ]
				var compInPoint = bone["inPoint"];
				var compOutPoint = bone["outPoint"];
				var compAnchorPoint = bone["anchorPoint"];
				if (compInPoint < masterDuration && compOutPoint > 0) {
					this.copyCompData(boneName,compName,compData,compInPoint,compAnchorPoint,animation,
						masterDuration,compOutPoint,bone["blendingMode"],bone["opacity"]);
				}
				if (animation["slots"][boneName]) {
					delete animation["slots"][boneName];
				}
				delete bone["comp"];
				delete bone["blendingMode"];
				delete bone["opacity"];
				delete bone["inPoint"];
				delete bone["outPoint"];
				delete bone["anchorPoint"];
			} else {
				this.addInPointAll( animation["bones"], animation["bones"], null, 0, masterDuration );
				this.addInPointAll( animation["slots"], animation["slots"], null, 0, masterDuration );
			}
			// Delete reference to layer data in bone animation before output
			delete this.jsonData.bones[i]["layer"];
			for (var name in animation["bones"]) {
				delete animation["bones"][name]["layer"];
			}
			// Delete reference to layer data in slot animation before output
			for (var name in animation["slots"]) {
				delete animation["slots"][name]["layer"];
			}
			i++;
		}
		// Delete reference to opacity value in slot animation before output
		for (var name in animation["slots"]) {
			var anim = animation["slots"][name];
			if (anim.hasOwnProperty("color")) {
				for (var j=0; j<anim["color"].length; j++) {
					delete anim["color"][j]["opacity"];
				}
			}
		}
	}

	AE2JSON.prototype.copyCompData = function(parentBoneName,compName,compData,compInPoint,compAnchorPoint,compAnimation,
		                                       masterDuration,compOutPoint,compBlendingMode,compOpacity){
		// Make a copy first
		compData = JSON.parse(JSON.stringify(compData));
		//
		// Copy bones
		//
		var numBones = compData.bones.length;
		for (var i=0; i<numBones; i++) {
			var boneData = compData.bones[i];
			if (boneData.parent) {
				var newBoneData = {};
				for (var prop in boneData) {
					newBoneData[prop] = boneData[prop];
				}
				if (newBoneData.hasOwnProperty("inPoint")) {
					newBoneData["inPoint"] += compInPoint;
				}
				if (newBoneData.hasOwnProperty("outPoint")) {
					newBoneData["outPoint"] += compInPoint;
				}
				if (newBoneData.hasOwnProperty("blendingMode") && newBoneData["blendingMode"] == BlendingMode.NORMAL) {
					newBoneData["blendingMode"] = compBlendingMode;
				}
				if (newBoneData.hasOwnProperty["opacity"]) {
					newBoneData["opacity"] = newBoneData["opacity"] * compOpacity/100.0;
				}
				if (newBoneData.parent == "root") {
					newBoneData["x"] -= compAnchorPoint[0];
					newBoneData["y"] += compAnchorPoint[1];
					newBoneData.parent = parentBoneName;
				} else {
					newBoneData.parent = parentBoneName+"_"+newBoneData.parent;
				}
				newBoneData.name = parentBoneName+"_"+newBoneData.name;
				this.jsonData.bones.push(newBoneData);
			}
		}
		//
		// Copy slots
		//
		var slotStartingIndex = 0;
		while (slotStartingIndex < this.jsonData.slots.length) {
			if (this.jsonData.slots[slotStartingIndex]["comp"] == parentBoneName) {
				break;
			}
			slotStartingIndex++;
		}
		var numSlots = compData.slots.length;
		for (var i=0; i<numSlots; i++) {
			var slotData = compData.slots[i];
			var name = slotData["name"];
			var attachment = slotData["attachment"] ? slotData["attachment"] : null;
			var newSlotData = {
				"name": parentBoneName+"_"+name,
				"bone": parentBoneName+"_"+slotData["bone"],
				"attachment": attachment
			};
			if (slotData["additive"]) {
				newSlotData["additive"] = slotData["additive"];
			}
			if (compBlendingMode != BlendingMode.NORMAL) {
				newSlotData["additive"] = true;
			}
			if (slotData["color"]) {
				newSlotData["color"] = slotData["color"];
				if (compOpacity < 100.0) {
					newSlotData["color"] = this.opacityToHex( this.getOpacity(newSlotData["color"]) * compOpacity/100.0 );
				}
			} else if (compOpacity < 100.0) {
				newSlotData["color"] = this.opacityToHex( compOpacity );
			}
			if (slotData["comp"]) {
				newSlotData["comp"] = parentBoneName+"_"+slotData["comp"];
			}
			this.jsonData.slots.splice(slotStartingIndex+i,0,newSlotData);
			if (compInPoint > 0) {
				var animData = compData["animations"][this.animationName]["slots"][name];
				var attachmentTimeline;
				if (!animData) {
					attachmentTimeline = []
					animData = compData["animations"][this.animationName]["slots"][name] = {
						"attachment": attachmentTimeline
					};
				} else {
					attachmentTimeline = animData["attachment"];
					if (!attachmentTimeline) {
						attachmentTimeline = animData["attachment"] = [];
					}
				}
				if (attachmentTimeline.length == 0 || attachmentTimeline[0]["name"] != null) {
					var newAnimData = {
						"time": -compInPoint,
						"name": null
					};
					attachmentTimeline.splice(0,0,newAnimData);
					newAnimData = {
						"time": 0,
						"name": attachment
					};
					attachmentTimeline.splice(1,0,newAnimData);
				}
			}
		}
		if (this.jsonData.slots[slotStartingIndex+i]["comp"]) {
			this.jsonData.slots.splice(slotStartingIndex+i,1);
		}
		//
		// Copy skins
		//
		for (var name in compData["skins"]["default"]) {
			var skinData = compData["skins"]["default"][name];
			var newSkinData = {};
			for (var prop in skinData) {
				newSkinData[prop] = skinData[prop];
			}
			this.jsonData["skins"]["default"][parentBoneName+"_"+name] = newSkinData;
		}
		//
		// Copy slot animations
		//
		var colorAnimation = compAnimation["slots"][parentBoneName] && compAnimation["slots"][parentBoneName].hasOwnProperty("color") ? compAnimation["slots"][parentBoneName]["color"] : null;
		var fromAnimData = compData["animations"][this.animationName]["slots"];
		var toAnimData = this.jsonData["animations"][this.animationName]["slots"];
		for (var name in fromAnimData) {
			var animEntry = fromAnimData[name];
			toAnimData[parentBoneName+"_"+name] = animEntry;
			this.addInPoint( animEntry, compInPoint, masterDuration, animEntry["layer"] );
			if (compOpacity < 100.0 && animEntry.hasOwnProperty("color")) {
				for (var j=0; j<animEntry["color"].length; j++) {
					var opacity = animEntry["color"][j]["opacity"] * compOpacity/100.0;
					animEntry["color"][j]["opacity"] = opacity;
					animEntry["color"][j]["color"] = this.opacityToHex( opacity );
				}
			}
			// if (colorAnimation) {
			// 	if (animEntry.hasOwnProperty("color") == false) {
			// 		animEntry["color"] = JSON.parse(JSON.stringify(colorAnimation));
			// 	}
			// }
		}
		// Duplicate any color animation onto every slot in the nested comp that doesn't have some already
		if (colorAnimation) {
			for (var i=0; i<numSlots; i++) {
				var slotData = this.jsonData.slots[slotStartingIndex + i];
				var name = slotData["name"];
				if (!toAnimData) {
					toAnimData = {};
				}
				var animEntry = toAnimData[name];
				if (!animEntry) {
					animEntry = toAnimData[name] = {};
				}
				if (!animEntry.hasOwnProperty("color")) {
					animEntry["color"] = [];
					for (var j=0; j<colorAnimation.length; j++) {
						animEntry["color"].push( {
							"time": colorAnimation[j]["time"],
							"color": this.opacityToHex( colorAnimation[j]["opacity"] * compOpacity/100.0 ),
							"opacity": colorAnimation[j]["opacity"]
						})
					}
				} else {
					var numColors = animEntry["color"].length;
					var compColors = colorAnimation.length;
// alert(JSON.stringify(animEntry["color"],null,"\t")+"\n\n"+JSON.stringify(colorAnimation,null,"\t"));
					var j=0,k=0;
					//   0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9
					//         j
					// J * *   *            *      *   *
					// K     *       *   *           *   *
					//               k
					var newColorAnim = [];
					var opacity;
					do {
						var compEntry = colorAnimation[k<compColors?k:compColors-1];
						var colorEntry = animEntry["color"][j<numColors?j:numColors-1];
						var newColorEntry = {};

						if (colorEntry["time"] == compEntry["time"] || j >= numColors || k >= compColors) {
							opacity = (colorEntry["opacity"]/100.0) * compEntry["opacity"];
							newColorEntry["time"] = colorEntry["time"] > compEntry["time"] ? colorEntry["time"] : compEntry["time"];
// newColorEntry["debug"] = "equal";
// alert("EQUAL\n"+"K "+k+" "+compEntry["time"]+"\n"+"J "+j+" "+colorEntry["time"]+"\n");
							j++;
							k++;
						} else if (colorEntry["time"] > compEntry["time"]) {
// alert("K "+compEntry["time"]+"\n"+j+"<"+numColors+"\n"+k+"<"+compColors);
							var prev = compEntry;
							var next = colorAnimation[k+1<compColors?k+1:compColors-1];
							opacity = interpolate( prev["opacity"], next["opacity"], prev["time"], next["time"], colorEntry["time"] );
							opacity = (compEntry["opacity"]/100.0) * opacity;
							newColorEntry["time"] = colorEntry["time"];
// newColorEntry["debug"] = "j ahead";
// alert("J AHEAD\n"+"K "+k+" "+compEntry["time"]+"\n"+"J "+j+" "+colorEntry["time"]+"\n");
							k++;
						} else {
// alert("J "+colorEntry["time"]+"\n"+j+"<"+numColors+"\n"+k+"<"+compColors);
							var prev = colorEntry;
							var next = animEntry["color"][j+1<numColors?j+1:numColors-1];
							opacity = interpolate( prev["opacity"], next["opacity"], prev["time"], next["time"], colorEntry["time"] );
							opacity = (compEntry["opacity"]/100.0) * opacity;
							newColorEntry["time"] = colorEntry["time"];
// newColorEntry["debug"] = "k ahead";
// alert("K AHEAD\n"+"K "+k+" "+compEntry["time"]+"\n"+"J "+j+" "+colorEntry["time"]+"\n");
							j++;
						}
						newColorEntry["color"] = this.opacityToHex( opacity );
						newColorEntry["opacity"] = opacity;
// newColorEntry["j"] = j;
// newColorEntry["k"] = k;
						newColorAnim.push( newColorEntry );
// alert("AT\n"+j+"<"+numColors+"\n"+k+"<"+compColors);
					} while ( j<numColors || k<compColors );

					animEntry["color"] = newColorAnim.sort( function(a,b) {
						if (a["time"] < b["time"]) return -1; else if (a["time"] > b["time"]) return 1; return 0;
					} );
// alert(JSON.stringify(animEntry["color"],null,"\t"));
				}
			}
		}
		// If the comp layer ends before the end of the master composition, then add slot keyframes to null out all textures, making it invisible.
		if (compOutPoint < masterDuration) {
			for (var i=0; i<numSlots; i++) {
				var slotData = this.jsonData.slots[slotStartingIndex + i];
				var name = slotData["name"];
				if (!toAnimData) {
					toAnimData = {};
				}
				var animEntry = toAnimData[name];
				if (!animEntry) {
					animEntry = toAnimData[name] = {};
				}
				var attachmentTimeline = animEntry["attachment"];
				if (!attachmentTimeline) {
					attachmentTimeline = animEntry["attachment"] = attachmentTimeline = []
				}
				if (attachmentTimeline.length == 0 || attachmentTimeline[attachmentTimeline.length-1]["time"] != compOutPoint) {
					attachmentTimeline.push({
						"time": compOutPoint,
						"name": null
					})
				} else {
					attachmentTimeline[attachmentTimeline.length-1]["name"] = null;
				}
			}
		}
		//
		// Copy bone animation data
		//
		this.addInPointAll( compData["animations"][this.animationName]["bones"],
			this.jsonData["animations"][this.animationName]["bones"], parentBoneName, compInPoint, masterDuration );
	}

	AE2JSON.prototype.findEntryBeforeTime = function( animData, time ) {
		var len=animData.length;
		var i=0;
		while (i<len && animData[i]["time"] < time) {
			i++;
		}
		return animData[i<len?i:len-1];
	}

	AE2JSON.prototype.findEntryAfterTime = function( animData, time ) {
		var len=animData.length;
		var i=len-1;
		while (i>=0 && animData[i]["time"] > time) {
			i++;
		}
		return animData[i>0?i:0];
	}

	AE2JSON.prototype.getOpacity = function( rgbaString ) {
		return (parseInt("0x"+rgbaString.substr(-2)) / 255.0) * 100.0;
	}

	AE2JSON.prototype.opacityToHex = function( opacity ) {
		var newValue = Math.round((opacity / 100.0) * 0xFF);
		var opacityHex = ("0"+newValue.toString(16)).substr(-2);
		return "FFFFFF" + opacityHex;
	}

	AE2JSON.prototype.addInPointAll = function(fromAnimData,toAnimData,parentBoneName,inPoint,masterDuration){
		for (var name in fromAnimData) {
			var animEntry = fromAnimData[name];
			if (parentBoneName != null) {
				name = parentBoneName+"_"+name;
			}
			toAnimData[name] = animEntry;
			this.addInPoint( animEntry, inPoint, masterDuration, animEntry["layer"] );
		}
	}

	AE2JSON.prototype.addInPoint = function(animEntry,inPoint,masterDuration,layer){
		for (var prop in animEntry) {
			if (animEntry[prop] instanceof Array ) {
				var len = animEntry[prop].length;
				if (len > 0 && animEntry[prop][0].hasOwnProperty("time") ) {
					var i, startIndex=-1, endIndex=-1;
					for (i=0; i<len; i++) {
						var newTime = (animEntry[prop][i]["time"] += inPoint);
						if (newTime >= 0 && startIndex == -1) {
							startIndex = i;
						}
						if (newTime <= masterDuration ) {
							endIndex = i;
						}
					}
 					if (endIndex != (len-1)) {
						this.spliceKeyframesEnd( animEntry[prop], endIndex+1, inPoint, masterDuration, layer, prop );
					}
					if (startIndex > 0) {
						this.spliceKeyframesStart( animEntry[prop], startIndex, inPoint, masterDuration, layer, prop );
					}
				}
			} else if (animEntry[prop] && typeof animEntry[prop] == "object" ) {
				this.addInPoint( animEntry[prop], inPoint, masterDuration, layer);
			}
		}
		return true;
	}

	AE2JSON.prototype.countKeyframes = function(animEntry,count){
		if (count == undefined) {
			count = 0;
		}
		for (var prop in animEntry) {
			if (animEntry[prop] instanceof Array ) {
				var len = animEntry[prop].length;
				if (len > 0 && animEntry[prop][0].hasOwnProperty("time") ) {
					count += len;
				}
			} else if (animEntry[prop] && typeof animEntry[prop] == "object" ) {
				count = this.countKeyframes( animEntry[prop], count);
			}
		}
		return count;
	}

	AE2JSON.prototype.spliceKeyframesEnd = function(animData,index,inPoint,masterDuration,layer,prop) {
		var len = animData.length;
		// If there's only 1 keyframe or we'll only be left with one keyframe
		if (len == 1 || index == 0) {
			animData[0]["time"] = masterDuration;
			if (len > 1) {
				animData.splice(1,len-1);
			}
			return;
		}
		var timeline;
		var timelineIndex;
		var newValue;
		switch (prop) {
			case "translate":
				animData[index]["time"] = masterDuration;
				timeline = layer.transform.position_timeline;
				timelineIndex = this.findTimelineIndexAfter( timeline, masterDuration-inPoint );
				newValue = timeline[timelineIndex];
				animData[index]["x"] =  (newValue[2][0] - timeline[0][2][0]);
				animData[index]["y"] = -(newValue[2][1] - timeline[0][2][1]);
				break;
			case "rotate":
				animData[index]["time"] = masterDuration;
				timeline = layer.transform.rotation_timeline;
				timelineIndex = this.findTimelineIndexAfter( timeline, masterDuration-inPoint );
				newValue = timeline[0][2] - timeline[timelineIndex][2];
				animData[index]["angle"] = newValue % 360;
				break;
			case "scale":
				animData[index]["time"] = masterDuration;
				timeline = layer.transform.scale_timeline;
				timelineIndex = this.findTimelineIndexAfter( timeline, masterDuration-inPoint );
				newValue = timeline[timelineIndex];
				animData[index]["x"] = newValue[2][0] / 100.0;
				animData[index]["y"] = newValue[2][1] / 100.0;
				break;
			case "attachment":
				--index;	// Just delete attachment keyframes beyond the end of the master timeline
				break;
			case "color":
				animData[index]["time"] = masterDuration;
				timeline = layer.transform.opacity_timeline;
				timelineIndex = this.findTimelineIndexAfter( timeline, masterDuration-inPoint );
				animData[index]["color"] = this.opacityToHex(timeline[timelineIndex][2]);
				break;
		}
		if (index < len-1) {
			animData.splice(index+1,len-index-1);
			if (animData[index]["curve"] == "stepped") {
				delete animData[index]["curve"];
			}
		}
	}

	AE2JSON.prototype.findTimelineIndexAfter = function(timeline,time) {
		var len = timeline.length;
		var i;
		for (i=0; i<len; i++) {
			if (timeline[i][0] >= time) {
				break;
			}
		}
		return i == len ? i-1 : i;
	}

	AE2JSON.prototype.spliceKeyframesStart = function(animData,index,inPoint,masterDuration,layer,prop) {
		var len = animData.length;
		// If there's only 1 keyframe or we'll only be left with one keyframe
		if (len == 1 || index == len-1) {
			if (len > 1) {
				animData.splice(0,len-1);
			}
			animData[0]["time"] = 0.0;
			return;
		}
		if (index > 1) {
			animData.splice(0,index-1);
		}
		var timeline;
		var timelineIndex;
		var newValue;
		switch (prop) {
			case "translate":
				animData[0]["time"] = 0.0;
				timeline = layer.transform.position_timeline;
				timelineIndex = this.findTimelineIndexBefore( timeline, -inPoint );
				newValue = timeline[timelineIndex];
				animData[0]["x"] =  (newValue[2][0] - timeline[0][2][0]);
				animData[0]["y"] = -(newValue[2][1] - timeline[0][2][1]);
				break;
			case "rotate":
				animData[0]["time"] = 0.0;
				timeline = layer.transform.rotation_timeline;
				timelineIndex = this.findTimelineIndexBefore( timeline, -inPoint );
				newValue = timeline[timelineIndex][2];
				animData[0]["angle"] = -newValue;
				break;
			case "scale":
				animData[0]["time"] = 0.0;
				timeline = layer.transform.scale_timeline;
				timelineIndex = this.findTimelineIndexBefore( timeline, -inPoint );
				newValue = timeline[timelineIndex];
				animData[0]["x"] = newValue[2][0] / 100.0;
				animData[0]["y"] = newValue[2][1] / 100.0;
				break;
			case "attachment":
				--index;	// Just delete attachment keyframes beyond the end of the master timeline
				break;
			case "color":
				animData[0]["time"] = 0.0;
				timeline = layer.transform.opacity_timeline;
				timelineIndex = this.findTimelineIndexBefore( timeline, -inPoint );
				animData[0]["color"] = this.opacityToHex(timeline[timelineIndex][2]);
				break;
		}
	}

	AE2JSON.prototype.findTimelineIndexBefore = function(timeline,time) {
		var len = timeline.length;
		var i;
		for (i=len-1; i>=0; i--) {
			if (timeline[i][0] <= time) {
				break;
			}
		}
		return i < 0 ? i-1 : i;
	}


	/**
	 * Linear interpolation between two keyframe times.
	 * Return interpolated color.
	 * 
	 * @param A    ARGB for point A.
	 * @param B    ARGB for point B.
	 * @param t1   First keyframe time.
	 * @param t2   Second keyframe time.
	 * @param newT New mid-point keyframe time.
	 * @return Interpolated color.
	 */
	function argbInterpolate( A, B, t1, t2, newT ) {
		var L = t2 - t1;
		if (L==0) return A;
		var l = (newT >= t1) ? ((newT <= t2) ? (newT - t1) : L) : 0;
		var Aa = (A >> 24) & 0xff;
		var Ar = (A >> 16) & 0xff;
		var Ag = (A >> 8) & 0xff;
		var Ab = A & 0xff;
		var Ba = (B >> 24) & 0xff;
		var Br = (B >> 16) & 0xff;
		var Bg = (B >> 8) & 0xff;
		var Bb = B & 0xff;
		var Ya = (Aa + l*(Ba - Aa)/L);
		var Yr = (Ar + l*(Br - Ar)/L);
		var Yg = (Ag + l*(Bg - Ag)/L);
		var Yb = (Ab + l*(Bb - Ab)/L);
		return  ((Ya << 24) & 0xff000000) |
				((Yr << 16) & 0xff0000) |
				((Yg << 8) & 0xff00) |
				(Yb & 0xff);
	}

	/**
	 * Linear interpolation between two X, Y coordinates.
	 * Return interpolated values.
	 * 
	 * @param A    {"x", "y"} for point A.
	 * @param B    {"x", "y"} for point B.
	 * @param t1   First keyframe time.
	 * @param t2   Second keyframe time.
	 * @param newT New mid-point keyframe time.
	 * @return Interpolated coordinates.
	 */
	function xyInterpolate( A, B, t1, t2, newT ) {
		var L = t2 - t1;
		if (L==0) return A;
		var l = (newT >= t1) ? ((newT <= t2) ? (newT - t1) : L) : 0;
		return {
			"x": A["x"] + (l * (B["x"]-A["x"])/L),
			"y": A["y"] + (l * (B["y"]-A["y"])/L)
		};
	}

	/**
	 * Linear interpolation between two values.
	 * Return interpolated values.
	 * 
	 * @param A    First value
	 * @param B    Second value
	 * @param t1   First keyframe time.
	 * @param t2   Second keyframe time.
	 * @param newT New mid-point keyframe time.
	 * @return Interpolated value
	 */
	function interpolate( A, B, t1, t2, newT ) {
		var L = t2 - t1;
		if (L==0) return A;
		var l = (newT >= t1) ? ((newT <= t2) ? (newT - t1) : L) : 0;
		return A + (l * (B-A)/L);
	}

	AE2JSON.prototype.checkLayerType = function(layer){
		if(layer instanceof CameraLayer){
			return "CAMERA";
		}else if(layer instanceof LightLayer){
			return "LIGHT";
		}else if(layer.threeDLayer == true){
			if(layer.nullLayer == true){
				return "NULL";
			}else if(layer.nullLayer == false){
				return "SOLID";
			}
		}else if(layer instanceof AVLayer == true){
			return "AV";
		}else if(layer instanceof ShapeLayer == true){
			return "SHAPE";
		}
	}

	AE2JSON.prototype.doCompLayers = function(myComp) {
        
        var composition = this.jsonData.composition;
        
		var myComp, myLayer, numLayers, layerType;
		if(myComp instanceof CompItem) {
			numLayers = myComp.layers.length;
			var usedNames = {};
			for(i=0; i<numLayers; i++) {
				myLayer = myComp.layers[i+1];
                
                // We ignore adjustement layers
                if(myLayer.adjustmentLayer)
                    continue;
                    
                layerType = this.checkLayerType(myLayer);
                var layerData = null;
                switch(layerType){
                    case "NULL":
                        layerData = new Null(this.jsonData.composition.compSettings, myLayer, this.spatialTolerance);
                        break;
                    case "AV":
                        layerData = new AV(this.jsonData.composition.compSettings, myLayer, this.spatialTolerance);
                        if (myLayer.source instanceof CompItem) {
                            this.referencedComps.push(myLayer.source)
                        }
                        
                        // If this layer has effects, we should render it and use it as a image layer
                        if( myLayer("Effects").numProperties > 0 ) {
                            this.renderLayer(myLayer);
                        }
                    
                        
                        break;
                    case "SHAPE":
                        layerData = new ShapeObj(this.jsonData.composition.compSettings, myLayer, this.spatialTolerance);
                        break;
                    default:
                        //this.jsonData.composition.layers.push("unknown "+getObjectClass(myLayer));
                        break;
                }
            
            
                if (layerData != null) {
                    if (usedNames.hasOwnProperty(layerData.name) == false) {
                        usedNames[layerData.name] = 1;
                    } else {
                        layerData.name += "_L"+(usedNames[layerData.name]++);
                    }
                
                
                      if(!_.isUndefined(composition.layerLookup[layerData.index]))
                        throw new Error("A layer with index " + layerData.index + "already exists");
                
                    composition.layers.push(layerData);                            
                      // We save lookup data so we can reference layers by internal index
                      composition.layerLookup[layerData.index] = _.size(composition.layers) - 1;
                }
			}
		}
        else
        {
            writeDebugLog("Found non CompItem layer " + layer.index)
        }
	}

	AE2JSON.prototype.makeSpineBoneName = function(layer) {
        if(_.isUndefined(layer))
            throw new Error("Layer is undefined");       
        
		var layerName = layer.name.replace(/\.[a-z]+_/,'_');
		layerName = layerName.replace(/([^\/]+)\/.*(_L[0-9]+)$/,"$1$2");
		return layerName;
	}

	AE2JSON.prototype.makeSpineSlotName = function(layer) {
		return this.makeSpineBoneName(layer);
	}


	AE2JSON.prototype.makeSpineAttachmentNameStr = function(sourceName) {
		if (sourceName == null) {
			return null;
		} else {
			var attachmentName = sourceName.replace(/([^\.]+).*/,"$1");
			attachmentName = attachmentName
				.replace(/_L[0-9]+$/,'')
				.replace(/ /g,'_')
				.replace(/\.[A-Za-z\.]+$/,'');
			if (this.numCompsSelected > 1) {
				return this.projName+"-assets/"+attachmentName;
			} else {
				return this.activeComp+"-assets/"+attachmentName;
			}
		}
	}

	AE2JSON.prototype.makeSpineAttachmentName = function(layer, time) {
		var name = layer.sourceName;
		if (time != undefined && layer.files) {
			var frame = 0;
			if (layer.timeRemap) {
				var key = 0;
				for (key = 0; key < layer.timeRemap.length; key++) {
					if (layer.timeRemap[key][0] <= time) {
						break;
					}
				}
				if (key == layer.timeRemap.length) {
					key = layer.timeRemap.length-1;
				}
				var nextKey = key+1;
				if (nextKey == layer.timeRemap.length) {
					nextKey = layer.timeRemap.length-1;
				}
				var beforeTime = layer.timeRemap[key][0];
				var afterTime = layer.timeRemap[nextKey][0];
				var dt1 = afterTime - beforeTime;
				var dt2 = time - beforeTime;
				var ratio = dt1 == 0 ? 0 : (dt2 / dt1);
				var beforeFrame = layer.timeRemap[key][1];
				var afterFrame = layer.timeRemap[nextKey][1];
				var df = afterFrame - beforeFrame;
				frame = Math.round( beforeFrame + (df * ratio) );
			} else {
				frame = Math.round( (time - layer.inPoint) / layer.frameRate);
			}
			// Cap?
			if (frame >= layer.files.length) {
				frame = layer.files.length - 1;
			}
			if (time < layer.inPoint || time > layer.outPoint) {
				name = null;
			} else {
				name = layer.files[frame];
				//if (frame == 0) { alert(name); }
			}
		}
		return this.makeSpineAttachmentNameStr( name );
	}

	AE2JSON.prototype.makeSpineAttachmentNames = function(layer) {
		var result = new Array()
		if (!layer.files) {
			result.push( this.makeSpineAttachmentName(layer) );
		} else {
			var numFiles = layer.files.length;
			for (var i=0; i<numFiles; ++i) {
				//alert( layer.files[i] );
				result.push( this.makeSpineAttachmentNameStr( layer.files[i] ));
			}
		}
		return result;
	}

	AE2JSON.prototype.generateSpineBones = function() {
		var bonesData = [ { "name": "root" } ];
		var layers = this.jsonData.composition.layers;
         var layerLookup = this.jsonData.composition.layerLookup;
		var totalLayers = _.size(layers);
		var boneNames = {};
		var boneGenerated = new Array();
		boneGenerated.push(0);
		this.rootScale = 1.0;
		this.rootX = 0.0;
		this.rootY = 0.0;
		while( boneGenerated.length <= totalLayers ) {
			for (var i=0; i < totalLayers; i++) {
				this.progress();
				var layer = layers[i];
                
				var boneName = this.makeSpineBoneName( layer );
				var parentExists = false;
				var layerExists = false;
				for (var j=0; j<boneGenerated.length; j++) {
					if (boneGenerated[j] == layer.parent) {
						parentExists = true;
					}
					if (boneGenerated[j] == layer.index) {
						layerExists = true;
					}
				}
				if ((layer.layerType == "AV" || layer.layerType == "Shape") && parentExists &&
					!layerExists && boneNames[boneName] != true) {
					if (!layer.transform.position_timeline) {
						alert(boneName);
					}
					var tx = layer.transform.position_timeline[0][2][0];
					var ty = -layer.transform.position_timeline[0][2][1];
					var sx = (layer.transform.scale_timeline[0][2][0] / 100.0);
					var sy = (layer.transform.scale_timeline[0][2][1] / 100.0);
					var parentIndex = layerLookup[layer.parent];
					var parentName = bonesData[0].name;	// root
					var parentOffsetX;
					var parentOffsetY;
					var scale = 1.0;//this.rootScale;
					if (parentIndex > 0) {
						parent = layers[parentIndex];
						parentName = this.makeSpineBoneName( parent );
						parentOffsetX = -parent.transform.anchorPoint_timeline[0][2][0];
						parentOffsetY = parent.transform.anchorPoint_timeline[0][2][1];
					} else {
						parentOffsetX = -this.rootX;
						parentOffsetY = this.rootY;
					}
					var boneData = {
						"name": boneName,
						"parent": parentName,
						"x": (tx + parentOffsetX) * scale,
						"y": (ty + parentOffsetY) * scale
					};
					if (layer.comp) {
						boneData["comp"] = layer.comp;
						boneData["blendingMode"] = layer.blendingMode;
						boneData["opacity"] = (layer.transform.opacity.length == 1) ? layer.transform.opacity_timeline[0][2] : 100.0;
						boneData["inPoint"] = layer.inPoint;
						boneData["outPoint"] = layer.outPoint;
						boneData["anchorPoint"] = [
							layer.transform.anchorPoint_timeline[0][2][0],
							layer.transform.anchorPoint_timeline[0][2][1]
						]
					}
					if (Math.round(sx*10000) != 10000) {
						if (sx < 0.001 && sx > -0.001) sx = sx < 0.0 ? -0.001 : 0.001;
						boneData["scaleX"] = sx;
					}
					if (Math.round(sy*10000) != 10000) {
						if (sy < 0.001 && sy > -0.001) sy = sy < 0.0 ? -0.001 : 0.001;
						boneData["scaleY"] = sy;
					}
					var rotation = (360-layer.transform.rotation_timeline[0][2])%360;
					if (rotation != 0.0) {
						boneData["rotation"] = rotation;
					}
					boneNames[boneName] = true;
					if (layer.enabled) {
						bonesData.push(boneData);
					}
					boneGenerated.push(layer.index);
				} else {
					if (!layerExists && boneNames[boneName] == true ) {
						boneGenerated.push(layer.index);
					}
				}
			}
		}

		// Add metadata for sorting
		var numBones = bonesData.length;
		for (var i=0; i<numBones; i++) {
			var bone = bonesData[i];
			var parent = bone;
			var depth = 0;
			var fullName = bone["name"]
			while ( (parent = parent["parent"]) != undefined ) {
				for (var j=0; j<numBones; j++) {
					var otherBone = bonesData[j];
					if (otherBone["name"] == parent) {
						parent = otherBone;
						break;
					}
				}
				fullName = parent["name"] + fullName;
				depth++;
			}
			// bone["fullName"] = fullName;
			bone["depth"] = depth;
		}

		// Sort Spine bone data
		bonesData.sort( function(a,b) {
			if (a["depth"] == b["depth"]) {
				return a["name"].localeCompare( b["name"] );
			} else {
				return a["depth"] < b["depth"] ? -1 : 1;
			}
		} );

		// Remove metadata for sorting
		for (var i=0; i<numBones; i++) {
			var bone = bonesData[i];
			// delete bone["fullName"];
			delete bone["depth"];
		}

		return bonesData;
	}

	AE2JSON.prototype.generateSpineSlots = function() {
		var slotsData = [];
		var layers = this.jsonData.composition.layers;
		var numLayers = layers.length;
		for (var i=numLayers-1; i>=0; i--) {
			var layer = layers[i];
            
			if (layer.enabled) {
				var slotName = this.makeSpineSlotName( layer );
				var found = false;
				for (var j=0; j<slotsData.length; j++) {
					if (slotsData[j].name == slotName) {
						found = true;
						break;
					}
				}
				if (!found) {
					var attachmentName = this.makeSpineAttachmentName( layer, 0 );
					var slotData = {
						"name": slotName,
						"bone": this.makeSpineBoneName( layer )
					};
					if (layer.comp) {
						slotData["comp"] = slotData["bone"];
					}
					if (layer.inPoint <= 0.0) {
						slotData["attachment"] = attachmentName;
					}
					if (layer.blendingMode != BlendingMode.NORMAL) {
						slotData["additive"] = true;
					}
					var opacity = layer.transform.opacity[0][1];
					if (opacity < 100.0) {
						slotData["color"] = this.opacityToHex( opacity );
					}
					slotsData.push( slotData );
				}
			}
		}
		return slotsData;
	}

	AE2JSON.prototype.generateSpineSkins = function() {
		var skinsData = {};
		var layers = this.jsonData.composition.layers;
		var numLayers = layers.length;
		for (var i=numLayers-1; i>=0; i--) {
			var layer = layers[i];
            
			if (!layer.comp && layer.enabled) {
				var slotName = this.makeSpineSlotName( layer );
				var attachmentNames = this.makeSpineAttachmentNames( layer );
				var skinData = skinsData[slotName];
				if (!skinData) {
					skinData = {};
				}
				var dx = layer.transform.anchorPoint[0][1][0] * this.rootScale;
				var dy = layer.transform.anchorPoint[0][1][1] * this.rootScale;
				var width = layer.width * this.rootScale;
				var height = layer.height * this.rootScale;
				var numAttachments = attachmentNames.length;
				for (var j=0; j<numAttachments; ++j) {
					skinData[ attachmentNames[j] ] = {
						"x":  width/2 - dx,
						"y": -height/2 + dy,
						"width": width,
						"height": height
					}
				}
				skinsData[slotName] = skinData;
			}
		}
		return { "default": skinsData };
	}

	AE2JSON.prototype.generateSpineSlotAnimations = function() {
		var slotAnimData = {};
		var layers = this.jsonData.composition.layers;
		var numLayers = layers.length;
		var numKeys, time;
		var frameDuration = 1.0/30.0;	//this.jsonData.composition.compSettings.frameDuration;
		var compDuration = this.jsonData.composition.compSettings.duration;
		for (var i=numLayers-1; i>=0; i--) {
			var layer = layers[i];
            
			var boneName = this.makeSpineBoneName( layer );
			if (layer.transform.opacity.length > 1) {
				var colorTimeline = [];
				numKeys = layer.transform.opacity.length;
				for (var j=0; j<numKeys; j++) {
					frame = layer.transform.opacity[j][0];
					var opacity = layer.transform.opacity[j][1];
					var keyData = {
						"time": frame * frameDuration,
						"color": this.opacityToHex( opacity ),
						"opacity": opacity   // Must delete before output
					};
					var tangentType = layer.transform.opacity[j][2];
					if (tangentType == "hold" || ((j<numKeys-1) && (layer.transform.opacity[j+1][0] == frame+1))) {
						keyData["curve"] = "stepped";
					}
					colorTimeline.push(keyData);
				}
				if (!slotAnimData[boneName]) slotAnimData[boneName] = {};
				slotAnimData[boneName]["color"] = colorTimeline;
			}
			var attachmentTimeline = null;
			var attachmentName = this.makeSpineAttachmentName( layer, 0 );

			numKeys = layer.timeRemap ? layer.timeRemap.length : 0;

			if (layer.inPoint > 0.0) {
				if (!slotAnimData[boneName]) slotAnimData[boneName] = {};
				attachmentTimeline = slotAnimData[boneName]["attachment"];
				if (!attachmentTimeline) {
					slotAnimData[boneName]["attachment"] = attachmentTimeline = []
					attachmentName = this.makeSpineAttachmentName( layer, layer.inPoint );
					if (layer.outPoint >= compDuration) {
						attachmentTimeline.push({
							"time": 0.0,
							"name": null
						});
					}
					attachmentTimeline.push({
						"time": layer.inPoint,
						"name": attachmentName
					});
				}
			}

			if (layer.files) {
				if (!slotAnimData[boneName]) slotAnimData[boneName] = {};
				attachmentTimeline = slotAnimData[boneName]["attachment"];
				if (!attachmentTimeline) slotAnimData[boneName]["attachment"] = attachmentTimeline = [];
				if (layer.timeRemap) {
					for (var index=0; index<numKeys; index++) {
						var nextIndex = (index+1 < numKeys) ? index+1 : index;
						var fromTime = layer.timeRemap[index][0];
						var toTime = layer.timeRemap[nextIndex][0];
						var fromFrame = layer.timeRemap[index][1];
						var toFrame = layer.timeRemap[nextIndex][1];
						var numFrames = Math.abs(toFrame - fromFrame) + 1;
						var keyDuration = toTime - fromTime;
						var dt = keyDuration / (numFrames+1);
						var step = fromFrame > toFrame ? -1 : 1;
						for (var j=0; j<numFrames; j++) {
							var frame = fromFrame + (j * step);
							if (frame >= layer.files.length) {
								frame = layer.files.length-1;
							} else if (frame < 0) {
								frame = 0;
							}
							var time = fromTime + (dt * j);
							var thisFramesAttachmentName = this.makeSpineAttachmentNameStr( layer.files[frame] );
							if (thisFramesAttachmentName != attachmentName) {
								attachmentTimeline.push({
									"time": time,
									"name": thisFramesAttachmentName
								});
								attachmentName = thisFramesAttachmentName;
							}
						}
					}
				} else {
					var fromTime = layer.inPoint;
					var toTime = layer.outPoint;
					var duration = toTime - fromTime;
					var numFrames = layer.files.length;
					var dt = duration / (numFrames+1);
					for (var frame=0; frame<numFrames; frame++) {
						var time = fromTime + (dt * frame);
						var thisFramesAttachmentName = this.makeSpineAttachmentNameStr( layer.files[frame] );
						if (thisFramesAttachmentName != attachmentName) {
							attachmentTimeline.push({
								"time": time,
								"name": thisFramesAttachmentName
							});
							attachmentName = thisFramesAttachmentName;
						}
					}
				}
			}

			if (layer.outPoint < compDuration) {
				if (!slotAnimData[boneName]) slotAnimData[boneName] = {};
				attachmentTimeline = slotAnimData[boneName]["attachment"];
				if (!attachmentTimeline) slotAnimData[boneName]["attachment"] = attachmentTimeline = [];
				if (attachmentTimeline.length == 0) {
					attachmentName = this.makeSpineAttachmentName( layer, 0 );
					attachmentTimeline.push({
						"time": 0.0,
						"name": attachmentName
					});
				}
				attachmentTimeline.push({
					"time": layer.outPoint,
					"name": null
				});
			}

			if (slotAnimData[boneName]) {
				slotAnimData[boneName]["layer"] = layer;	// Must delete before output
			}

		}
		return slotAnimData;
	}

	AE2JSON.prototype.generateSpineBoneAnimations = function() {
		var boneAnimData = {};
		var layers = this.jsonData.composition.layers;
		var numLayers = layers.length;
		var numKeys, time;
		var frameDuration = 1.0/30.0;	//this.jsonData.composition.compSettings.frameDuration;
		for (var i=numLayers-1; i>=0; i--) {
			var layer = layers[i];
			if (layer.enabled) {
				var boneName = this.makeSpineBoneName( layer );
				if (layer.transform.position.length > 1) {
					var translateTimeline = [];
					numKeys = layer.transform.position.length;
					for (var j=0; j<numKeys; j++) {
						frame = layer.transform.position[j][0];
						var keyData =  {
							"time": frame * frameDuration,
							"x": (layer.transform.position[j][1][0] - layer.transform.position_timeline[0][2][0]) * this.rootScale,
							"y":-(layer.transform.position[j][1][1] - layer.transform.position_timeline[0][2][1]) * this.rootScale
						};
						var tangentType = layer.transform.position[j][2];
						if (tangentType == "hold") {
							keyData["curve"] = "stepped";
						} else if (tangentType == "bezier" && j < numKeys-1) {
							keyData["curve"] = [
								layer.transform.position[j][3][0],
								layer.transform.position[j][3][1],
								layer.transform.position[j][4][0],
								layer.transform.position[j][4][1]
							];
						}
						translateTimeline.push( keyData );
					}
					if (!boneAnimData[boneName]) boneAnimData[boneName] = {};
					boneAnimData[boneName]["translate"] = translateTimeline;
				}
				if (layer.transform.scale.length > 1) {
					var scaleTimeline = [];
					numKeys = layer.transform.scale.length;
					var sx = layer.transform.scale_timeline[0][2][0] / 100.0;
					if (sx < 0.001 && sx > -0.001) sx = sx < 0.0 ? -0.001 : 0.001;
					var sy = layer.transform.scale_timeline[0][2][1] / 100.0;
					if (sy < 0.001 && sy > -0.001) sy = sy < 0.0 ? -0.001 : 0.001;
					for (var j=0; j<numKeys; j++) {
						frame = layer.transform.scale[j][0];
						var keyData = {
							"time": frame * frameDuration,
							"x": (layer.transform.scale[j][1][0]/100.0) / sx,
							"y": (layer.transform.scale[j][1][1]/100.0) / sy
						};
						var tangentType = layer.transform.scale[j][2];
						if (tangentType == "hold") {
							keyData["curve"] = "stepped";
						}
						scaleTimeline.push( keyData );
					}
					if (!boneAnimData[boneName]) boneAnimData[boneName] = {};
					boneAnimData[boneName]["scale"] = scaleTimeline;
				}
				if (layer.transform.rotation.length > 1) {
					var rotateTimeline = [];
					numKeys = layer.transform.rotation.length;
					var lastValue = 0;
					var lastTime = layer.transform.rotation[0][0] * frameDuration;
					for (var j=0; j<numKeys; j++) {
						var tangentType = layer.transform.rotation[j][2];
						var time = layer.transform.rotation[j][0] * frameDuration;
						var value = (layer.transform.rotation_timeline[0][2] - layer.transform.rotation[j][1]);
						var delta = value - lastValue;
						var steps = Math.floor(Math.abs(delta) / 180) + 1;
						var dt = (time - lastTime) / steps;
						delta /= steps;
						for (var k=1; k<=steps; k++) {
							var keyData = {
								"time": lastTime + (dt * k),

								// DEBUG STUFF
								// "rotation": layer.transform.rotation[j][1],
								// "delta": delta*steps,
								// "steps": steps,
								// "k": k,
								// "j": j,
								// "value": value,
								// "lastValue": lastValue,

								"angle": (lastValue + (delta * k)) % 360
							};
							if (tangentType == "hold") {
								keyData["curve"] = "stepped";
							}
							rotateTimeline.push( keyData );
						}
						lastValue = value;
						lastTime = time;
					}
					if (!boneAnimData[boneName]) boneAnimData[boneName] = {};
					boneAnimData[boneName]["rotate"] = rotateTimeline;
				}
				if (boneAnimData[boneName]) {
					boneAnimData[boneName]["layer"] = layer;	// Must delete before output
				}
			}
		}
		return boneAnimData;
	}

	AE2JSON.prototype.generateSpineData = function() {
		var layers = this.jsonData.composition.layers;
		var numLayers = layers.length;
		var bonesData = this.generateSpineBones();
		var slotsData = this.generateSpineSlots();
		var skinsData = this.generateSpineSkins();
		var boneAnimData = this.generateSpineBoneAnimations();
		var slotAnimData = this.generateSpineSlotAnimations();
		var spineData = {
			"bones": bonesData,
			"slots": slotsData,
			"skins": skinsData,
			"animations": {}
		};
		spineData["animations"][this.animationName] = {
			"bones": boneAnimData,
			"slots": slotAnimData
		}
		return spineData;
	}


	AE2JSON.prototype.renderJSON = function(toFile) {
		// create JSON file.
		var compName    = app.project.activeItem ? app.project.activeItem.name : app.project.file.name.replace(/\..*/,"");
		var fileName    = compName + this.filenameSuffix + ".json";
		fileName    = fileName.replace(/\s/g, '');

		var path = app.project.file.parent.absoluteURI + "/";
		var fullPath = path + fileName;

		var jsonString = JSON.stringify(this.jsonData, null, "\t");
		if (toFile == true) {
			var jsonExportFile = new File(fullPath);
			jsonExportFile.open("w");
			jsonExportFile.write(jsonString);
			jsonExportFile.close();
			this.outputFilename = fullPath;
		}
	}




     
    AE2JSON.prototype.renderLayer = function(layer) {
        var composition = layer.containingComp;
        
        var renderQueueItem = app.project.renderQueue.items.add(composition);
        this.layerRenderQueueItems.push(renderQueueItem);
        
        // We will only render this layer, but we save the solo layer flags of 
        // each layer to restore them later.
        var soloLayers = _.filter(_.range(1, composition.numLayers+1), function(i) { return composition.layer(i).solo });
        _.each(soloLayers, function(index) { composition.layer(index).solo = true });
        
        layer.solo = true;
        
        // We have the render settings and output module saved as a template
        renderQueueItem.applyTemplate("Effect Layers");
        var renderSettings = _.mapObject(renderQueueItem.getSettings(), function(v, k) { return renderQueueItem.getSetting(k) });
        
        var output = renderQueueItem.outputModule(1);
        output.applyTemplate("PNG Sequence");

        var outputFolder = new Folder(app.project.file.parent);
        var outputFilePath = './' + composition.name + '/' + layer.name + '[#####].png';
        if(!outputFolder.changePath(outputFilePath))
        {
            throw new Error("Invalid file path " + outputFilePath);            
        }
        
        output.file = new File(outputFolder.fullName);
        
        if(!output.file.parent.create())
        {
            throw new Error("Could not create folder", output.file.parent);
        }
    
        var outputSettings = _.mapObject(output.getSettings(), function(v, k) { return output.getSetting(k) });
        
        app.project.renderQueue.render();
        
        renderQueueItem.remove();
        
        // Restore saved solo layers
        layer.solo = false;
        _.each(soloLayers, function(index) { composition.layer(index).solo = false });

        
        
    }
    
    
    function CompSettings(compObj){
		this.name          = compObj.name;
		this.width         = compObj.width;
		this.height        = compObj.height;
		this.frameRate     = compObj.frameRate;
		this.frameDuration = compObj.frameDuration;
		this.duration      = compObj.duration;

		return this;
	}




	function BaseObject(compSettings, layer, spatialTolerance){
		// Do not store layer, it's too big and can cause a stack overflow
		this.spatialTolerance = spatialTolerance;
		this.objData = {};
		this.beforeDefaults(compSettings, layer);
		this.setDefaults(compSettings, layer);
		this.afterDefaults(compSettings, layer);
	}

	BaseObject.prototype.beforeDefaults = function(compSettings, layer){
		return true;
	}

	BaseObject.prototype.afterDefaults = function(compSettings, layer){
		return true;
	}

	BaseObject.prototype.setDefaults = function(compSettings, layer){
		this.objData.name  = this.createName(layer.name, layer.index);
		this.objData.index = layer.index;
		this.objData.inPoint = layer.inPoint;
		this.objData.outPoint = layer.outPoint;
		if (this.objData.inPoint > this.objData.outPoint) {
			var temp = this.objData.inPoint;
			this.objData.inPoint = this.objData.outPoint;
			this.objData.outPoint = temp;
		}
		this.objData.compSettings = compSettings;
		this.compSettings  = compSettings;
		this.setPropGroups();
		this.doProps(layer); 
	}

	BaseObject.prototype.createName = function(name, index){
		// Remove filename extensions in name
		name = name.replace( /\.[^\/\\]+/, "" );		// + "_L" + index;
		return name;
	}

	BaseObject.prototype.setPropGroups = function(){
		this.propGroups = ["transform"];
	}

	BaseObject.prototype.doProps = function(layer){
		var i, j, hasParent, parentLayer, numPropGroups, propGroup, groupName, group, propName, prop, visible;

		numPropGroups = this.propGroups.length;

		hasParent = false;

		if(layer.parent != null){
			hasParent = true;
			parentLayer = layer.parent;
			this.objData.parent = parentLayer.index; //this.createName(parentLayer.name, parentLayer.index);
			//layer.parent = null;
		}else{
			this.objData.parent = 0;
		}

		for(i=0; i<numPropGroups; i++){
			groupName = this.propGroups[i];
			group     = this.objData[groupName] = {};
			propGroup = layer[groupName];


			if (propGroup.numProperties != undefined ) {
				for (j = 1; j < propGroup.numProperties; j++){
					prop = propGroup.property(j);
					visible = true;
					try{
						prop.selected = true;
					}catch (err){
						visible = false;
					}
					if (visible) {
						propName = prop.name;
						propName = propName.toCamelCase();
						group[propName] = this.setPropValues(prop,true,layer.name,propName);
						group[propName+"_timeline"] = this.setPropValues(prop,false,layer.name,propName);
					}
				}
				this.combineXY( "position", group );
				this.combineXY( "rotation", group );
			} else {
				this.objData[groupName] = this.setPropValues(propGroup,true,layer.name,propName);
				this.objData[groupName+"_timeline"] = this.setPropValues(prop,false,layer.name,propName);
			}
		}
	}

	BaseObject.prototype.combineXY = function( propName, group ){
		if (!group.hasOwnProperty(propName)) {
		var xPropName = "x"+propName.charAt(0).toUpperCase() + propName.slice(1);
			if (group.hasOwnProperty(xPropName)) {
				var xPropName = "y"+propName.charAt(0).toUpperCase() + propName.slice(1);
				var xp = group[xPropName];
				var yp = group[yPropName];
				var numX = xp.length;
				var numY = yp.length;
				var pos=[];
				for (var i=0, j=0; i<numX || j<numY; ) {
					var x,y,t;
					var xd = i<numX ? xp[i] : xp[i-1];	// assume there's always at least one?
					var yd = j<numY ? yp[j] : yp[j-1];
					if (xd[0] < yd[0]) {
						t = xd[0];
						x = xd[1];
						y = (j>=numY-1) ? yp[numY-1][1] : interpolate(yp[j][1],yp[j+1][1],yp[j][0],yp[j+1][0],t);
						if (i<numX) i++; else if (j<numY) j++;
					} else if (xd[0] > yd[0]) {
						t = yd[0];
						y = yd[1];
						x = (i>=numX-1) ? xp[numX-1][1] : interpolate(xp[i][1],xp[i+1][1],xp[i][0],xp[i+1][0],t);
						if (j<numY) j++; else if (i<numX) i++;
					} else {
						t = xd[0];
						x = xd[1];
						y = yd[1];
						if (i<numX) i++;
						if (j<numY) j++;
					}
					pos.push([t,[x,y,0],"linear"]);
				}
				group[propName] = pos;
				xp = group[xPropName+"_timeline"];
				yp = group[yPropName+"_timeline"];
				pos = [];
				for (var i=0; i<xp.length; i++) {
					pos.push( [
						xp[i][0],
						i,
						[ xp[i][2], yp[i][2], 0 ]
					]);
				}
				group[propName+"_timeline"] = pos;
			}
		}
	}

	BaseObject.prototype.setPropValues = function(prop,asKeyframes,layerName,propName){
		var duration = this.compSettings.duration;
		var frameDuration = this.compSettings.frameDuration;
		var frameRate = this.compSettings.frameRate;
		var timeSampleRate = 1.0/(frameRate*1);	//1.0/60.0;
		var tolerance = this.spatialTolerance; // 1/15.0;	// <-- Smaller numbers produce more intermediate keyframes (using 999 to basically disable for now - too many keyframes)
		var timeValues = new Array();
		if (asKeyframes) {
			if (prop.numKeys > 1) {
				if (tolerance == 0) {
					var startFrame = 0; //Number(timeToCurrentFormat(firstKeyTime, frameRate));
					var endFrame   = Math.floor(duration / frameDuration)-1;	//Number(timeToCurrentFormat(lastKeyTime, frameRate));
					for(frame = startFrame; frame <= endFrame; frame++){
						time = frame * frameDuration;
						propVal = prop.valueAtTime(time, false);
						timeValues.push([frame, propVal]);
					}
				} else {
					for(keyIndex = 1; keyIndex <= prop.numKeys; keyIndex++) {
						var keyTime = prop.keyTime(keyIndex);
						if (keyTime < 0) {
							var frame = 0;
							var propVal = prop.valueAtTime(0.0, false);
							var keyData = [frame, propVal,"linear"];
							if (timeValues.length == 0) {
								timeValues.push(keyData);
							}
							continue;
						}
						var frame = keyTime / frameDuration;
						var propVal = prop.valueAtTime(keyTime, false);
						var interpolation = prop.keyOutInterpolationType(keyIndex);
						var keyData = [frame, propVal];
						if (interpolation == KeyframeInterpolationType.HOLD) {
							keyData.push((keyIndex < prop.numKeys-1) ? "hold" : "linear");
							timeValues.push(keyData);
						} else {
							if (prop.isSpatial) {
								keyData.push("linear");
								timeValues.push(keyData);
								if (keyIndex <= prop.numKeys-1) {
									var nextPropVal = prop.keyValue(keyIndex+1);
									var nextKeyTime = prop.keyTime(keyIndex+1);
									var distance = dist( propVal, nextPropVal );
									var steps = (nextKeyTime - keyTime) / timeSampleRate;
									var dx = (nextPropVal[0] - propVal[0]) / steps;
									var dy = (nextPropVal[1] - propVal[1]) / steps;
									propVal = propVal.slice(0);	//clone
									var time = keyTime;
									for ( var i=1; i<steps; i++ ) {
										time+=timeSampleRate;
										propVal[0] += dx;
										propVal[1] += dy;
										var interVal = prop.valueAtTime(time, true);
										var interDist = dist( interVal, propVal );
										var intollerable = tolerance == 0 || (interDist > distance*tolerance);
										if (intollerable) {
											propVal = interVal.slice(0);	//clone
											//distance = dist( propVal, nextPropVal );
											dx = (nextPropVal[0] - propVal[0]) / (steps-i);
											dy = (nextPropVal[1] - propVal[1]) / (steps-i);
											keyData = [time/frameDuration, propVal.slice(0), "linear"];
											timeValues.push(keyData);
										}
									}
								}
							} else {
								if (interpolation == KeyframeInterpolationType.LINEAR) {
									keyData.push("linear");
								} else if (interpolation == KeyframeInterpolationType.BEZIER) {
									keyData.push("linear");
									// keyData.push("bezier");
									// var easeIn = prop.keyInSpatialEase(keyIndex);
									// keyData.push(easeIn[0]);
									// var easeOut = prop.keyOutSpatialEase(keyIndex);
									// keyData.push(easeOut[0]);
								}
								timeValues.push(keyData);
							}
						}
					}
				}
				// Delete redundant key frames from the end
				for (var i = timeValues.length-1; i>0; i--) {
					if (equals(timeValues[i][1],timeValues[i-1][1])) {
						timeValues.splice(i,1);
					} else {
						break;
					}
				}
			} else {
				timeValues.push([0, prop.value, "hold"]);
			}
		} else {
			startFrame = 0; //Number(timeToCurrentFormat(firstKeyTime, frameRate));
			endFrame   = Math.floor(duration / frameDuration)-1;	//Number(timeToCurrentFormat(lastKeyTime, frameRate));
			for(frame = startFrame; frame <= endFrame; frame++){
				time = frame * frameDuration;
				propVal = prop.valueAtTime(time, false);
				timeValues.push([time, frame, propVal]);
			}
		}
		
		return timeValues;
	}

	


	Null.prototype = Object.create(BaseObject.prototype);
	function Null(compSettings, layer, spatialTolerance){
		BaseObject.call(this, compSettings, layer, spatialTolerance);
		return this.objData;
	}

	Null.prototype.beforeDefaults = function(compSettings, layer){
		this.objData.layerType = "Null";
	}
	


	AV.prototype = Object.create(BaseObject.prototype);
	function AV(compSettings, layer, spatialTolerance){
		BaseObject.call(this, compSettings, layer, spatialTolerance);
		return this.objData;
	}

	AV.prototype.beforeDefaults = function(compSettings, layer){
		this.objData.layerType = "AV";
		this.objData.sourceName = layer.source.name;
		this.objData.width = layer.width;
		this.objData.height = layer.height;
		this.objData.enabled = layer.enabled;
		this.objData.blendingMode = layer.blendingMode;
		if( layer.source.mainSource && layer.source.mainSource.file && !layer.source.mainSource.isStill ) {
			var sourceFilename = layer.source.mainSource.file.toString();
			var baseName = sourceFilename.replace(/^(.*?)[0-9]+\.png$/,"$1");
			var dirName = sourceFilename.replace(/^(.*\/)[^\/]+\.png$/,"$1");
			var baseDirName = dirName.substr(dirName.indexOf("-assets")+8);
			var matchName = baseName.replace(dirName,"") + "*.png";
			var dir = new Folder(dirName);
			this.objData.frameRate = layer.source.frameRate;
			this.objData.files = new Array();
			var files = dir.getFiles(matchName);
			var numFiles = files.length;
			for (var i=0; i<numFiles; ++i) {
				var name = baseDirName + files[i].name;
				this.objData.files.push( name );
			}
		}
		if (layer.source instanceof CompItem) {
			this.objData.comp = layer.source.name;
		} else {
			this.objData.comp = null;
		}
	}
	
	AV.prototype.afterDefaults = function(compSettings, layer){
		if (layer["timeRemapEnabled"]) {
			var duration      = this.compSettings.duration;
			var frameDuration = this.compSettings.frameDuration;
			var frameRate     = this.compSettings.frameRate;

			var startFrame = 0; //Number(timeToCurrentFormat(firstKeyTime, frameRate));
			var endFrame   = Math.floor(duration / frameDuration)-1;	//Number(timeToCurrentFormat(lastKeyTime, frameRate));

			// The time remap keyframe values only
			this.objData["timeRemap"] = this.setPropValues(layer["timeRemap"],true,layer.name,"timeRemap");
			var len = this.objData["timeRemap"].length;
			this.objData["timeRemap"].sort( function(a,b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });
			for (var i=0; i<len; i++) {
				var frame = this.objData["timeRemap"][i][0];
				time = Math.round( frame ) * frameDuration;
				this.objData["timeRemap"][i][0] = time;
				var value = this.objData["timeRemap"][i][1];
				value = Math.round(value * layer.source.frameRate);
				this.objData["timeRemap"][i][1] = value;
			}
		}
	}


	ShapeObj.prototype = Object.create(BaseObject.prototype);
	function ShapeObj(compSettings, layer, spatialTolerance){
		BaseObject.call(this, compSettings, layer, spatialTolerance);
		return this.objData;
	}

	ShapeObj.prototype.beforeDefaults = function(compSettings, layer){
		this.objData.layerType = "Shape";
		this.objData.width = layer.width;
		this.objData.height = layer.height;
		this.objData.blendingMode = layer.blendingMode;
	}

	if (app.project.file == null) {
		alert("Please save this project file first, then run again.")
	} else {
		new AE2JSON(this,true);
	}

}
