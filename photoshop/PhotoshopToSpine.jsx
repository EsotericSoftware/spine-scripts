#target photoshop
app.bringToFront();

// https://github.com/EsotericSoftware/spine-scripts/tree/master/photoshop
// This script exports Adobe Photoshop layers as individual PNGs. It also
// writes a JSON file which can be imported into Spine where the images
// will be displayed in the same positions and draw order.

// Copyright (c) 2012-2022, Esoteric Software
// All rights reserved.
// Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
//     * Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
//     * Neither the name of Esoteric Software nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

var scriptVersion = "7.42"; // This is incremented every time the script is modified, so you know if you have the latest.

var revealAll = false; // Set to true to enlarge the canvas so layers are not cropped.
var legacyJson = true; // Set to false to output the newer Spine JSON format.

var cs2 = parseInt(app.version) < 10, cID = charIDToTypeID, sID = stringIDToTypeID, tID = typeIDToStringID;

var originalDoc, settings, progress, cancel, errors, lastLayerName;
try {
	originalDoc = activeDocument;
} catch (ignored) {}

// Localization. Keep tags, file names, JSON keys and Photoshop identifiers untranslated.
var translations = {
	en: {
		languageName: "English",
		language: "Language:",
		automatic: "Automatic",
		languageTooltip: "Automatic follows Photoshop's language. An explicit choice overrides it and is remembered (except in CS2).",
		settings: "Settings",
		ignoreHiddenLayers: " Ignore hidden layers",
		ignoreBackground: " Ignore background layer",
		trimWhitespace: " Trim whitespace",
		writeJson: " Write Spine JSON",
		writeTemplate: " Write template image",
		selectionOnly: " Selection only",
		scale: "Scale:",
		padding: "Padding:",
		outputPaths: "Output Paths",
		images: "Images:",
		json: "JSON:",
		help: "Help",
		ok: "OK",
		cancel: "Cancel",
		close: "Close",
		templateTooltip: "When checked, a PNG is written for the currently visible layers.",
		jsonTooltip: "When checked, a Spine JSON file is written.",
		trimTooltip: "When checked, blank pixels around the edges of each image are removed.",
		selectionTooltip: "When checked, only the selected items are processed.",
		scaleTooltip: "Scales the PNG files. Useful when using higher resolution art in Photoshop than in Spine.",
		paddingTooltip: "Blank pixels around the edge of each image. Can avoid aliasing artifacts for opaque pixels along the image edge.",
		imagesTooltip: "The folder to write PNGs. Begin with \"./\" to be relative to the PSD file. Blank to disable writing PNGs.",
		jsonPathTooltip: "Output JSON file if ending with \".json\", else the folder to write the JSON file. Begin with \"./\" to be relative to the PSD file. Blank to disable writing a JSON file.",
		noJsonOutput: "<no JSON output>",
		noImageOutput: "<no image output>",
		minimumVersion: "Photoshop CS2 or later is required.",
		noDocument: "Please open a document before running the PhotoshopToSpine script.",
		saveDocument: "Please save the document before running the PhotoshopToSpine script.",
		windowError: "\n\nScript is unable to create a Window. Your Photoshop installation may be broken and may need to be reinstalled.\n\n%1",
		scaleRange: "Scale must be between > 0 and <= 400.",
		paddingRange: "Padding must be >= 0.",
		layerContext: "[layer %1] ",
		unexpectedError: "An unexpected error has occurred:\n\n%1[line: %2] %3\n\nTo debug, run the PhotoshopToSpine script using Adobe ExtendScript with \"Debug > Do not break on guarded exceptions\" unchecked.\n\nv%4",
		initializing: "Initializing...",
		collectingLayers: "Collecting layers...",
		processingLayers: "Processing layers...",
		selectionRequired: "At least one layer must be selected when \"Selection only\" is checked.",
		rgbRequired: "Please change the image mode to RGB color.",
		invalidAttachmentName: "Layer name is not a valid attachment name:\n\n%1",
		invalidScale: "Invalid scale %1:\n\n%2",
		parentBones: "Multiple layers for the \"%1\" bone have different parent bones:\n\n%2\n%3",
		defaultSkinReserved: "The skin name \"default\" is reserved:\n\n%1\n\nPlease use a different name.",
		expectedAttachmentPrefix: "Expected attachment name \"%1\" to start with skin name: %2/",
		duplicateSkinAttachment: "Multiple layers for the \"%1\" skin in the \"%2\" slot have the same name \"%3\":\n",
		duplicateSlotAttachment: "Multiple layers for the \"%1\" slot have the same name \"%2\":\n",
		renameDuplicates: "\n\nRename or use the [ignore] tag for these layers.",
		sourceMeshNotFound: "Source mesh \"%1\" not found in slot \"%2\":\n\n%3\n\nPrepend the skin name, if any. For example:\nskinName/%1",
		sourceNotMesh: "Layer \"%1\" is not a mesh:\n\n%2",
		meshCycle: "Mesh sources form a cycle:\n\n%1",
		seeOneError: "\n\nSee errors.txt for 1 additional error.",
		seeErrors: "\n\nSee errors.txt for %1 additional errors.",
		cantWriteOneError: "\n\nUnable to write 1 additional error to errors.txt.\n%1",
		cantWriteErrors: "\n\nUnable to write %1 additional errors to errors.txt.\n%2",
		invalidGroupName: "Invalid group name:\n\n%1",
		invalidLayerName: "Invalid layer name:\n\n%1",
		layerOnlyTag: "\n\nThe [%1] tag is only valid for layers, not for groups.",
		groupOnlyTag: "\n\nThe [%1] tag is only valid for groups, not for layers.",
		invalidTag: "\n\nThe [%1] tag is not a valid tag.",
		invalidNamePattern: "The pattern for the [name:pattern] tag must contain an asterisk (*):\n\n%1",
		cannotGetLayerProperty: "Unable to get layer %1 property: %2\n%3",
		unknownType: "Unknown type: %1",
		invalidSetting: "Invalid default setting: %1",
		helpTitle: "PhotoshopToSpine - Help",
		helpText: "This script writes layers as images and creates a JSON file to bring the images into Spine with the same positions and draw order they had in Photoshop.\n"
			+ "\nThe Photoshop ruler origin corresponds to 0,0 in Spine.\n"
			+ "\nTags in square brackets can be used anywhere in layer and group names to customize the output. If \":name\" is omitted, the layer or group name is used.\n"
			+ "\nGroup and layer names:\n"
			+ "•  [bone] or [bone:name]  Layers, slots, and bones are placed under a bone. The bone is created at the center of a visible layer. Bone groups can be nested.\n"
			+ "•  [slot] or [slot:name]  Layers are placed in a slot.\n"
			+ "•  [skin] or [skin:name]  Layers are placed in a skin. Skin layer images are output in a subfolder for the skin.\n"
			+ "•  [scale:number]  Layers are scaled. Their attachments are scaled inversely, so they appear the same size in Spine.\n"
			+ "•  [folder] or [folder:name]  Layer images are output in a subfolder. Folder groups can be nested.\n"
			+ "•  [overlay]  This layer is used as a clipping mask for all layers below.\n"
			+ "•  [trim] or [trim:false]  Force this layer to be whitespace trimmed or not.\n"
			+ "•  [mesh] or [mesh:name]  Layer is a mesh or, when a name is specified, a linked mesh.\n"
			+ "•  [ignore]  Layers, groups, and any child groups will not be output.\n"
			+ "\nGroup names:\n"
			+ "•  [merge]  Layers in the group are merged and a single image is output.\n"
			+ "•  [name:pattern]  Adds a prefix or suffix to layer names in the group. The pattern must contain an asterisk (*).\n"
			+ "\nLayer names:\n"
			+ "•  The layer name is used for the attachment or skin placeholder name, relative to any parent [skin] or [folder] groups. Can contain / for subfolders.\n"
			+ "•  [path:name]  Specifies the image file name, if it needs to be different from the attachment name. Can be used on a group with [merge].\n"
			+ "\nIf a layer name, folder name, or path name starts with / then parent layers won't affect the name."
	},
	// Based on Guto's translation, integrated with permission: https://esotericsoftware.com/forum/d/28974
	zh_CN: {
		languageName: "中文（简体）",
		language: "语言：",
		automatic: "自动",
		languageTooltip: "自动模式使用 Photoshop 的界面语言。手动选择的语言会覆盖自动设置并被记住（CS2 除外）。",
		settings: "设置",
		ignoreHiddenLayers: " 忽略隐藏图层",
		ignoreBackground: " 忽略背景图层",
		trimWhitespace: " 修剪透明像素",
		writeJson: " 写入 Spine JSON 数据",
		writeTemplate: " 创建完整预览图",
		selectionOnly: " 仅限选中图层",
		scale: "调整缩放：",
		padding: "像素填充：",
		outputPaths: "输出路径",
		images: "图像：",
		json: "JSON：",
		help: "帮助",
		ok: "确定",
		cancel: "取消",
		close: "关闭",
		templateTooltip: "选中后，将当前可见图层导出为一张 PNG 图像。",
		jsonTooltip: "选中后，生成 Spine JSON 文件。",
		trimTooltip: "选中后，移除每张图像边缘的透明像素。",
		selectionTooltip: "选中后，仅处理选中的项目。",
		scaleTooltip: "缩放 PNG 文件。适用于 Photoshop 中的原图分辨率高于 Spine 所需分辨率的情况。",
		paddingTooltip: "在每张图像的边缘添加透明像素，可避免图像边缘的不透明像素出现锯齿。",
		imagesTooltip: "PNG 文件的输出文件夹。以 \"./\" 开头表示相对于 PSD 文件的位置。留空则不输出 PNG 文件。",
		jsonPathTooltip: "以 \".json\" 结尾时指定输出 JSON 文件，否则指定其输出文件夹。以 \"./\" 开头表示相对于 PSD 文件的位置。留空则不输出 JSON 文件。",
		noJsonOutput: "<不输出 JSON>",
		noImageOutput: "<不输出图像>",
		minimumVersion: "需要 Photoshop CS2 或更高版本。",
		noDocument: "请先打开文档，再运行 PhotoshopToSpine 脚本。",
		saveDocument: "请先保存文档，再运行 PhotoshopToSpine 脚本。",
		windowError: "\n\n脚本无法创建窗口。您的 Photoshop 安装可能已损坏，需要重新安装。\n\n%1",
		scaleRange: "缩放比例必须大于 0 且小于或等于 400。",
		paddingRange: "像素填充必须大于或等于 0。",
		layerContext: "[图层 %1] ",
		unexpectedError: "发生了意外错误：\n\n%1[行号：%2] %3\n\n如需调试，请使用 Adobe ExtendScript 运行 PhotoshopToSpine 脚本，并取消勾选 \"Debug > Do not break on guarded exceptions\"。\n\nv%4",
		initializing: "正在初始化…",
		collectingLayers: "正在收集图层…",
		processingLayers: "正在处理图层…",
		selectionRequired: "勾选“仅限选中图层”时，必须至少选中一个图层。",
		rgbRequired: "请将图像模式改为 RGB 颜色。",
		invalidAttachmentName: "图层名称不是有效的附件名称：\n\n%1",
		invalidScale: "无效的缩放值 %1：\n\n%2",
		parentBones: "骨骼 \"%1\" 的多个图层具有不同的父骨骼：\n\n%2\n%3",
		defaultSkinReserved: "皮肤名称 \"default\" 是保留名称：\n\n%1\n\n请使用其他名称。",
		expectedAttachmentPrefix: "附件名称 \"%1\" 应以皮肤名称 %2/ 开头。",
		duplicateSkinAttachment: "皮肤 \"%1\" 在插槽 \"%2\" 中有多个图层使用相同的名称 \"%3\"：\n",
		duplicateSlotAttachment: "插槽 \"%1\" 中有多个图层使用相同的名称 \"%2\"：\n",
		renameDuplicates: "\n\n请重命名这些图层，或为其添加 [ignore] 标签。",
		sourceMeshNotFound: "在插槽 \"%2\" 中找不到源网格 \"%1\"：\n\n%3\n\n如果源网格属于某个皮肤，请在名称前加上皮肤名称。例如：\nskinName/%1",
		sourceNotMesh: "图层 \"%1\" 不是网格：\n\n%2",
		meshCycle: "网格源引用形成了循环：\n\n%1",
		seeOneError: "\n\n另有 1 个错误，请查看 errors.txt。",
		seeErrors: "\n\n另有 %1 个错误，请查看 errors.txt。",
		cantWriteOneError: "\n\n无法将另外 1 个错误写入 errors.txt。\n%1",
		cantWriteErrors: "\n\n无法将另外 %1 个错误写入 errors.txt。\n%2",
		invalidGroupName: "无效的组名称：\n\n%1",
		invalidLayerName: "无效的图层名称：\n\n%1",
		layerOnlyTag: "\n\n[%1] 标签仅适用于图层，不适用于组。",
		groupOnlyTag: "\n\n[%1] 标签仅适用于组，不适用于图层。",
		invalidTag: "\n\n[%1] 不是有效的标签。",
		invalidNamePattern: "[name:pattern] 标签的模式必须包含星号 (*)：\n\n%1",
		cannotGetLayerProperty: "无法获取图层 %1 的属性：%2\n%3",
		unknownType: "未知类型：%1",
		invalidSetting: "无效的默认设置：%1",
		helpTitle: "PhotoshopToSpine - 帮助",
		helpText: "此脚本将图层分层导出成图像，并创建一个 JSON 文件，以便将图像以 Photoshop 中相同的位置和绘制顺序导入 Spine 中。\n"
			+ "\nPhotoshop 中的标尺原点对应于 Spine 中的 0,0。\n"
			+ "\n方括号中的标签可用于图层和组名称中的任何位置，以自定义输出。如果省略 \":name\"，则使用图层或组名称。\n"
			+ "\n组和图层名称：\n"
			+ "•  [bone] 或 [bone:name]  图层、插槽和骨骼放置在骨骼下。骨骼在可见图层的中心创建。骨骼组可以嵌套。\n"
			+ "•  [slot] 或 [slot:name]  图层放置在插槽中。\n"
			+ "•  [skin] 或 [skin:name]  图层放置在皮肤中。皮肤图层图像输出在皮肤的子文件夹中。\n"
			+ "•  [scale:number]  图层缩放。其附件反向缩放，因此在 Spine 中显示大小相同。\n"
			+ "•  [folder] 或 [folder:name]  图层图像输出在子文件夹中。文件夹组可以嵌套。\n"
			+ "•  [overlay]  此图层用作所有下方图层的剪切蒙版。\n"
			+ "•  [trim] 或 [trim:false]  强制此图层进行空白裁剪或不裁剪。\n"
			+ "•  [mesh] 或 [mesh:name]  图层是一个网格，或者当指定名称时，是一个链接网格。\n"
			+ "•  [ignore]  图层、组以及任何子组将不会被输出。\n"
			+ "\n组名称：\n"
			+ "•  [merge]  组内的图层将被合并，并输出为一张图像。\n"
			+ "•  [name:pattern]  为组内的图层名称添加前缀或后缀。模式必须包含星号 (*)。\n"
			+ "\n图层名称：\n"
			+ "•  图层名称用于附件或皮肤占位符名称，相对于任何父 [skin] 或 [folder] 组。可以包含 / 以表示子文件夹。\n"
			+ "•  [path:name]  指定图像文件名，如果需要与附件名称不同。可以在带有 [merge] 的组上使用。\n"
			+ "\n如果图层名称、文件夹名称或路径名称以 / 开头，则父图层不会影响名称。"
	}
};
var language = "en";

function languageForLocale (locale) {
	locale = locale.toLowerCase().replace(/-/g, "_");
	for (var id in translations) {
		if (translations.hasOwnProperty(id) && id.toLowerCase() == locale) return id;
	}
	if (locale == "zh" || /^zh_(cn|sg|hans)(_|$)/.test(locale)) return "zh_CN";
	var base = locale.split("_")[0];
	return translations.hasOwnProperty(base) ? base : "en";
}

function selectLanguage () {
	if (settings.language != "auto" && !translations.hasOwnProperty(settings.language)) settings.language = "auto";
	language = settings.language;
	if (language == "auto") {
		var locale;
		try {
			locale = app.locale;
		} catch (ignored) {}
		language = languageForLocale(locale || $.locale || "");
	}
}

function tr (key) {
	var text = translations[language][key];
	if (text === undefined) text = translations.en[key];
	var args = arguments;
	return text.replace(/%([1-9][0-9]*)/g, function (match, index) { return args[parseInt(index, 10)]; });
}

// Settings.
var defaultSettings = {
	language: "auto",
	ignoreHiddenLayers: false,
	ignoreBackground: true,
	writeTemplate: false,
	writeJson: true,
	trimWhitespace: true,
	selectionOnly: false,
	scale: 1,
	padding: 1,
	imagesDir: "./images/",
	jsonPath: "./",
};
loadSettings();
selectLanguage();

function run () {
	showProgress();

	var selectedLayers;
	if (settings.selectionOnly) {
		selectedLayers = getSelectedLayers();
		if (!selectedLayers.length) {
			alert(tr("selectionRequired"));
			return;
		}
	}

	errors = [];

	// Output dirs.
	var jsonFile = new File(jsonPath(settings.jsonPath));
	jsonFile.parent.create();
	var imagesDir = absolutePath(settings.imagesDir);
	var imagesFolder = new Folder(imagesDir);
	imagesFolder.create();

	var docWidth = originalDoc.width.as("px"), docHeight = originalDoc.height.as("px");
	var xOffSet = rulerOrigin("H"), yOffSet = rulerOrigin("V");

	try {
		deleteDocumentAncestorsMetadata();
	} catch (ignored) {}

	originalDoc.duplicate();
	deselectLayers();

	if (revealAll) activeDocument.revealAll();

	try {
		convertToRGB();
	} catch (ignored) {}
	if (activeDocument.mode != DocumentMode.RGB) {
		alert(tr("rgbRequired"));
		return;
	}

	// Output template image.
	if (settings.writeTemplate) {
		if (settings.scale != 1) {
			storeHistory();
			scaleImage(settings.scale);
		}

		var file = new File(imagesDir + "template.png");
		if (file.exists) file.remove();

		savePNG(file);

		if (settings.scale != 1) restoreHistory();
	}

	if (!settings.jsonPath && !settings.imagesDir) return;

	rasterizeAll();

	// Add a history item to prevent layer visibility from changing by the active layer being reset to the top.
	var topLayer = activeDocument.artLayers.add();
	topLayer.name = "Collecting layers...";

	// Collect and hide layers.
	var rootLayers = [], layers = [];
	var context = {
		first: hasBackgroundLayer() ? 0 : 1,
		index: getLayerCount() - 1,
		total: 0
	};
	initializeLayers(context, selectedLayers, null, rootLayers);
	showProgress(tr("collectingLayers"), context.total);
	collectLayers(rootLayers, layers, []);

	// Store the bones, slot names, and layers for each skin.
	var bones = { _root: { name: "root", x: 0, y: 0, children: [] } };
	var slots = {}, slotsCount = 0;
	var skins = { _default: [] }, skinsCount = 0;
	var skinDuplicates = {};
	var totalLayerCount = 0;
	outer:
	for (var i = layers.length - 1; i >= 0; i--) {
		if (cancel) return;
		var layer = layers[i];

		var name = stripTags(layer.name).replace(/.png$/, "");
		name = name.replace(/[\\:"*?<>|]/g, "").replace(/^\.+$/, "").replace(/^__drag$/, ""); // Illegal.
		name = layer.applyNamePatterns(name);
		if (!name) continue;
		name = name.replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i, ""); // Windows.
		if (!name || name.length > 255) {
			error(tr("invalidAttachmentName", layer.name));
			continue;
		}

		var folderPath = layer.folders("");
		if (startsWith(name, "/")) {
			name = name.substring(1);
			layer.attachmentName = name;
		} else
			layer.attachmentName = folderPath + name;

		layer.attachmentPath = layer.findTagValue("path:");
		if (!layer.attachmentPath)
			layer.attachmentPath = layer.attachmentName;
		else if (startsWith(layer.attachmentPath, "/"))
			layer.attachmentPath = layer.attachmentPath.substring(1);
		else
			layer.attachmentPath = folderPath + layer.attachmentPath;

		var scale = layer.findTagValue("scale:");
		if (!scale) scale = 1;
		layer.scale = parseFloat(scale);
		if (isNaN(layer.scale)) error(tr("invalidScale", scale, layer.path()));

		var bone = null, boneLayer = layer.findTagLayer("bone");
		if (boneLayer) {
			var parent = boneLayer.getParentBone(bones);
			var boneName = boneLayer.findTagValue("bone");
			bone = get(bones, boneName);
			if (bone) {
				if (parent != bone.parent) {
					error(tr("parentBones", boneName, bone.layer.path(), boneLayer.path()));
					continue;
				}
			} else {
				set(bones, boneName, bone = { name: boneName, parent: parent, children: [], layer: boneLayer });
				parent.children.push(bone);
			}
			layer.updateBounds();
			bone.x = layer.left * settings.scale - settings.padding;
			bone.x += layer.width * settings.scale / 2 + settings.padding;
			bone.y = layer.bottom * settings.scale + settings.padding;
			bone.y -= layer.height * settings.scale / 2 + settings.padding;
			bone.y = docHeight * settings.scale - bone.y;
			// Make relative to the Photoshop document ruler origin.
			bone.x -= xOffSet * settings.scale;
			bone.y -= (docHeight - yOffSet) * settings.scale;
		}

		var skinName = null;
		var skinLayer = layer.findTagLayer("skin");
		if (skinLayer) {
			skinName = skinLayer.getTagValue("skin");
			if (startsWith(skinName, "/"))
				skinName = skinName.substring(1);
			else if (skinLayer.parent)
				skinName = skinLayer.parent.folders("") + skinName;
			if (skinName && skinName.toLowerCase() == "default") {
				error(tr("defaultSkinReserved", layer.path()));
				continue;
			}
		}
		if (!skinName) skinName = "default";
		layer.skinName = skinName;

		if (skinName == "default")
			layer.placeholderName = layer.attachmentName;
		else if (!startsWith(layer.attachmentName, skinName + "/")) { // Should never happen.
			error(tr("expectedAttachmentPrefix", layer.attachmentName, skinName));
			continue;
		} else
			layer.placeholderName = layer.attachmentName.substring(skinName.length + 1);

		layer.mesh = layer.findTagValue("mesh", true);
		var trim = layer.findTagValue("trim");
		layer.trim = trim != null ? trim != "false" : settings.trimWhitespace;

		layer.slotName = layer.findTagValue("slot") || name;
		var slot = get(slots, layer.slotName);
		if (!slot) {
			slotsCount++;
			set(slots, layer.slotName, slot = {
				bone: bone,
				attachment: layer.wasVisible ? layer.placeholderName : null,
				placeholders: {},
				attachments: false,
				layers: {}
			});
		} else if (!slot.attachment && layer.wasVisible)
			slot.attachment = layer.placeholderName;
		set(slot.layers, layer.attachmentName, layer);
		if (layer.blendMode == "linearDodge")
			slot.blend = "additive";
		else if (layer.blendMode == "multiply")
			slot.blend = "multiply";
		else if (layer.blendMode == "screen")
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
		var message = tr("duplicateSkinAttachment", layers[0].skinName, layers[0].slotName, layers[0].placeholderName);
		for (var i = 0, n = layers.length; i < n; i++)
			message += "\n" + layers[i].path();
		error(message + tr("renameDuplicates"));
	}

	var slotDuplicates = {};
	for (var slotName in slots) {
		if (!slots.hasOwnProperty(slotName)) continue;
		var slot = slots[slotName];

		// Error if a source mesh isn't found in the same slot.
		var layers = slot.layers;
		for (var attachmentName in layers) {
			if (!layers.hasOwnProperty(attachmentName)) continue;
			var layer = layers[attachmentName];
			if (!layer.mesh) continue;
			if (layer.mesh === true) continue;
			var source = get(layers, layer.mesh);
			if (!source) {
				error(tr("sourceMeshNotFound", layer.mesh, stripName(slotName), layer.path()));
				continue;
			}
			if (!source.mesh) {
				error(tr("sourceNotMesh", source.path(), layer.path()));
				continue;
			}
			layer.mesh = source;
		}

		// Error if a skin placeholder has the same name as a default skin attachment.
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
		var message = tr("duplicateSlotAttachment", layers[0].slotName, layers[0].placeholderName);
		for (var i = 0, n = layers.length; i < n; i++)
			message += "\n" + layers[i].path();
		error(message + tr("renameDuplicates"));
	}

	if (!errors.length) {
		for (var slotName in slots) {
			if (!slots.hasOwnProperty(slotName)) continue;
			var layers = slots[slotName].layers;
			for (var attachmentName in layers) {
				if (!layers.hasOwnProperty(attachmentName)) continue;
				var layer = layers[attachmentName];
				if (!layer.mesh) continue;
				var source = layer, visited = [];
				while (source.mesh !== true) {
					if (indexOf(visited, source) != -1) {
						error(tr("meshCycle", layer.path()));
						break;
					}
					visited.push(source);
					source = source.mesh;
				}
				if (source.mesh === true && source.trim) layer.scaledMeshSource = source;
			}
		}
	}

	var n = errors.length;
	if (n) {
		var first = errors[0];
		var file = null;
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
					first += tr("seeOneError");
				else
					first += tr("seeErrors", n - 1);
			} catch (e) {
				if (n == 2)
					first += tr("cantWriteOneError", e);
				else
					first += tr("cantWriteErrors", n - 1, e);
			}
		}
		alert(first);
		if (file) file.execute();
		return;
	}

	// Add a history item to prevent layer visibility from changing by restoreHistory.
	topLayer.name = "Processing layers...";
	showProgress(tr("processingLayers"), totalLayerCount);

	// Output skins.
	var jsonSkins = "", layerCount = 0, writeImages = settings.imagesDir, tabs = legacyJson ? '\t\t' : '\t\t\t';
	for (var skinName in skins) {
		if (!skins.hasOwnProperty(skinName)) continue;
		var skinSlots = skins[skinName];
		skinName = stripName(skinName);

		var jsonSkin = "";
		for (var slotName in skinSlots) {
			if (!skinSlots.hasOwnProperty(slotName)) continue;
			var slot = slots[slotName];
			var bone = slot.bone;
			var skinLayers = skinSlots[slotName];
			slotName = stripName(slotName);

			var jsonSlot = "";
			var outputLayer = function (layer) {
				if (layer.json != null) return layer.json;
				var output = layer, meshSource = layer.scaledMeshSource;
				output.json = "";
				// Prepare the source once, even when a linked layer appears earlier or in another skin.
				if (meshSource && meshSource != layer && !outputLayer(meshSource)) return "";
				layerCount++;
				layer.show();

				incrProgress(layer.name);
				if (cancel) return "";

				var attachmentName = layer.attachmentName, attachmentPath = layer.attachmentPath, placeholderName = layer.placeholderName, mesh = layer.mesh;
				var scale = layer.scale, overlays = layer.overlays;

				var trim = layer.trim;
				if (meshSource) {
					trim = true;
					scale = meshSource.scale;
					if (mesh !== true) mesh = meshSource;
				}

				if (layer.isGroup) {
					layer.select();
					merge();
					layer = new Layer(layer.id, layer.parent, layer.selected);
				}
				layer.rasterizeStyles();

				for (var ii = 0, nn = overlays.length; ii < nn; ii++) {
					var overlay = overlays[ii];
					overlay.moveAbove(layer);
					overlay.setClippingMask(true);
					overlay.show();
				}

				var sourceImage = meshSource && meshSource != output ? meshSource.scaledImage : null;
				var bounds = sourceImage ? sourceImage.bounds : mesh && mesh != true ? mesh : layer;
				if (!sourceImage) bounds.updateBounds();
				if (!bounds.width || !bounds.height) {
					layer.hide();
					return "";
				}
				slot.attachments = true;

				storeHistory();

				var x, y, width, height, attachmentImage;
				if (mesh && !meshSource) {
					if (trim) {
						x = bounds.left;
						y = bounds.top;
						width = bounds.width;
						height = bounds.height;
						activeDocument.crop([x - xOffSet, y - yOffSet, bounds.right - xOffSet, bounds.bottom - yOffSet], 0, width, height);
						x *= settings.scale;
						y *= settings.scale;
					} else {
						x = 0;
						y = 0;
						width = docWidth;
						height = docHeight;
					}
					width = width * settings.scale + settings.padding * 2;
					height = height * settings.scale + settings.padding * 2;
					if (writeImages) {
						scaleImage(settings.scale * scale);
						if (settings.padding > 0) activeDocument.resizeCanvas(width * scale, height * scale, AnchorPosition.MIDDLECENTER);
					}
					x -= settings.padding;
					y = settings.padding - y;
					width = Math.round(width * scale);
					height = Math.round(height * scale);
				} else {
					attachmentImage = scaleAttachmentImage(layer, trim, scale, sourceImage);
					if (meshSource) output.scaledImage = attachmentImage;
					x = attachmentImage.x;
					y = -attachmentImage.y;
					width = attachmentImage.width;
					height = attachmentImage.height;
				}

				// Save image.
				if (writeImages) {
					var file = new File(imagesDir + attachmentPath + ".png");
					file.parent.create();
					savePNG(file);
				}
				restoreHistory();

				if (layerCount < totalLayerCount) layer.hide();

				// Make relative to the Photoshop document ruler origin.
				x -= xOffSet * settings.scale;
				y += yOffSet * settings.scale;

				if (bone) { // Make relative to parent bone.
					x -= bone.x;
					y -= bone.y;
				}

				var json = "\t" + tabs + quote(placeholderName) + ': { ';
				if (attachmentName != placeholderName) json += '"name": ' + quote(attachmentName) + ', ';
				if (attachmentName != attachmentPath) json += '"path": ' + quote(attachmentPath) + ', ';
				if (mesh) {
					if (mesh === true)
						json += '"type": "mesh", ';
					else {
						json += '"type": "linkedmesh", "source": "' + mesh.placeholderName + '", "parent": "' + mesh.placeholderName + '", ';
						if (mesh.skinName) json += '"skin": "' + mesh.skinName + '", ';
					}
					var meshWidth = width, meshHeight = height;
					if (attachmentImage) {
						meshWidth *= attachmentImage.scaleX;
						meshHeight *= attachmentImage.scaleY;
						x -= meshWidth / 2;
						y += meshHeight / 2;
					}
					json += '"width": ' + width + ', "height": ' + height + ', "vertices": [ ';
					json += (x + meshWidth) + ', ' + (y - meshHeight) + ', ';
					json += x + ', ' + (y - meshHeight) + ', ';
					json += x + ', ' + y + ', ';
					json += (x + meshWidth) + ', ' + y + ' ], "uvs": [ 1, 1, 0, 1, 0, 0, 1, 0 ], "triangles": [ 1, 2, 3, 1, 3, 0 ], "hull": 4, "edges": [ 0, 2, 2, 4, 4, 6, 0, 6 ]';
				} else {
					json += '"x": ' + x + ', "y": ' + y + ', "width": ' + width + ', "height": ' + height;
					if (attachmentImage.scaleX != 1) json += ', "scaleX": ' + attachmentImage.scaleX;
					if (attachmentImage.scaleY != 1) json += ', "scaleY": ' + attachmentImage.scaleY;
				}
				json += ' },\n';
				return output.json = json;
			};
			for (var i = skinLayers.length - 1; i >= 0; i--) {
				jsonSlot += outputLayer(skinLayers[i]);
				if (cancel) return;
			}
			if (jsonSlot) jsonSkin += tabs + quote(slotName) + ': {\n' + jsonSlot.substring(0, jsonSlot.length - 2) + '\n' + tabs + '\},\n';
		}
		if (jsonSkin) {
			if (legacyJson)
				jsonSkins += '\t"' + skinName + '": {\n' + jsonSkin.substring(0, jsonSkin.length - 2) + '\n\t},\n';
			else
				jsonSkins += '\t{\n\t\t"name": ' + quote(skinName) + ',\n\t\t"attachments": {\n' + jsonSkin.substring(0, jsonSkin.length - 2) + '\n\t\t}\n\t},\n';
		}
	}
	lastLayerName = null;

	activeDocument.close(SaveOptions.DONOTSAVECHANGES);

	// Output skeleton.
	var json = '{ "skeleton": { "images": "' + imagesDir + '" },\n';
	json += '"PhotoshopToSpine": { "scale": ' + settings.scale + ', "padding": ' + settings.padding + ', "trim": ' + settings.trimWhitespace + ' },\n';
	json += '"bones": [\n';

	// Output bones.
	function outputBone (bone) {
		var json = bone.parent ? ',\n' : '';
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
		if (!slot.attachments) continue;
		slotName = stripName(slotName);
		json += '\t{ "name": ' + quote(slotName) + ', "bone": ' + quote(slot.bone ? slot.bone.name : "root");
		if (slot.attachment) json += ', "attachment": ' + quote(slot.attachment);
		if (slot.blend) json += ', "blend": ' + quote(slot.blend);
		json += ' }';
		slotIndex++;
		json += slotIndex < slotsCount ? ',\n' : '\n';
	}
	json += '],\n';

	if (jsonSkins) {
		if (legacyJson)
			json += '"skins": {\n' + jsonSkins.substring(0, jsonSkins.length - 2) + '\n},\n';
		else
			json += '"skins": [\n' + jsonSkins.substring(0, jsonSkins.length - 2) + '\n],\n';
	}

	json += '"animations": { "animation": {} }\n}';

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
		alert(tr("minimumVersion"));
		return;
	}
	if (!originalDoc) {
		alert(tr("noDocument"));
		return;
	}
	try {
		decodeURI(activeDocument.path);
	} catch (e) {
		alert(tr("saveDocument"));
		return;
	}

	// Layout.
	var localized = [];
	function text (parent, type, key, properties) {
		var control = parent.add(type, undefined, tr(key), properties);
		localized.push({control: control, key: key, property: "text"});
		return control;
	}
	function tooltip (control, key) {
		control.helpTip = tr(key);
		localized.push({control: control, key: key, property: "helpTip"});
	}
	var dialog, group;
	try {
		dialog = new Window("dialog", "PhotoshopToSpine v" + scriptVersion);
	} catch (e) {
		throw new Error(tr("windowError", e.message));
	}
	dialog.alignChildren = "fill";

	try {
		dialog.add("image", undefined, new File(scriptDir() + "logo.png"));
	} catch (ignored) {}

	var languageGroup = dialog.add("group");
	text(languageGroup, "statictext", "language");
	var languageSelect = languageGroup.add("dropdownlist"), languageIDs = ["auto"];
	languageSelect.add("item", tr("automatic"));
	for (var id in translations) {
		if (!translations.hasOwnProperty(id)) continue;
		languageIDs.push(id);
		languageSelect.add("item", translations[id].languageName);
	}
	languageSelect.selection = indexOf(languageIDs, settings.language);
	tooltip(languageSelect, "languageTooltip");

	var settingsGroup = text(dialog, "panel", "settings");
		settingsGroup.margins = [10,15,10,10];
		settingsGroup.alignChildren = "fill";
		var checkboxGroup = settingsGroup.add("group");
			checkboxGroup.alignChildren = ["left", ""];
			checkboxGroup.orientation = "row";
			group = checkboxGroup.add("group");
				group.orientation = "column";
				group.alignChildren = ["left", ""];
				var ignoreHiddenLayersCheckbox = text(group, "checkbox", "ignoreHiddenLayers");
				ignoreHiddenLayersCheckbox.value = settings.ignoreHiddenLayers;
				var ignoreBackgroundCheckbox = text(group, "checkbox", "ignoreBackground");
				ignoreBackgroundCheckbox.value = settings.ignoreBackground;
				var trimWhitespaceCheckbox = text(group, "checkbox", "trimWhitespace");
				trimWhitespaceCheckbox.value = settings.trimWhitespace;
			group = checkboxGroup.add("group");
				group.orientation = "column";
				group.alignChildren = ["left", ""];
				group.alignment = ["", "top"];
				var writeJsonCheckbox = text(group, "checkbox", "writeJson");
				writeJsonCheckbox.value = settings.writeJson;
				var writeTemplateCheckbox = text(group, "checkbox", "writeTemplate");
				writeTemplateCheckbox.value = settings.writeTemplate;
				var selectionOnlyCheckbox = text(group, "checkbox", "selectionOnly");
				selectionOnlyCheckbox.value = settings.selectionOnly;
		var scaleText, paddingText, scaleSlider, paddingSlider;
		if (!cs2) {
			var slidersGroup = settingsGroup.add("group");
				group = slidersGroup.add("group");
					group.orientation = "column";
					group.alignChildren = ["right", ""];
					text(group, "statictext", "scale");
					text(group, "statictext", "padding");
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
					scaleSlider = group.add("slider", undefined, settings.scale * 100, 1, 400);
					paddingSlider = group.add("slider", undefined, settings.padding, 0, 4);
		} else {
			group = settingsGroup.add("group");
				text(group, "statictext", "scale");
				scaleText = group.add("edittext", undefined, settings.scale * 100);
				scaleText.preferredSize.width = 50;
			scaleSlider = settingsGroup.add("slider", undefined, settings.scale * 100, 1, 400);
			group = settingsGroup.add("group");
				text(group, "statictext", "padding");
				paddingText = group.add("edittext", undefined, settings.padding);
				paddingText.preferredSize.width = 50;
			paddingSlider = settingsGroup.add("slider", undefined, settings.padding, 0, 4);
		}

	if (cs2) {
		ignoreHiddenLayersCheckbox.preferredSize.width = 150;
		ignoreBackgroundCheckbox.preferredSize.width = 150;
		trimWhitespaceCheckbox.preferredSize.width = 150;
		writeJsonCheckbox.preferredSize.width = 150;
		writeTemplateCheckbox.preferredSize.width = 150;
		selectionOnlyCheckbox.preferredSize.width = 150;
	}

	var outputPathGroup = text(dialog, "panel", "outputPaths");
		outputPathGroup.alignChildren = ["fill", ""];
		outputPathGroup.margins = [10,15,10,10];
		var imagesDirText, imagesDirPreview, jsonPathText, jsonPathPreview;
		if (!cs2) {
			var textGroup = outputPathGroup.add("group");
			textGroup.orientation = "column";
			textGroup.alignChildren = ["fill", ""];
			group = textGroup.add("group");
				text(group, "statictext", "images");
				imagesDirText = group.add("edittext", undefined, settings.imagesDir);
				imagesDirText.alignment = ["fill", ""];
			imagesDirPreview = textGroup.add("statictext", undefined, "");
			imagesDirPreview.maximumSize.width = 260;
			group = textGroup.add("group");
				var jsonLabel = text(group, "statictext", "json");
				jsonLabel.justify = "right";
				jsonLabel.minimumSize.width = 41;
				jsonPathText = group.add("edittext", undefined, settings.jsonPath);
				jsonPathText.alignment = ["fill", ""];
			jsonPathPreview = textGroup.add("statictext", undefined, "");
			jsonPathPreview.maximumSize.width = 260;
		} else {
			text(outputPathGroup, "statictext", "images");
			imagesDirText = outputPathGroup.add("edittext", undefined, settings.imagesDir);
			imagesDirText.alignment = "fill";
			text(outputPathGroup, "statictext", "json");
			jsonPathText = outputPathGroup.add("edittext", undefined, settings.jsonPath);
			jsonPathText.alignment = "fill";
		}
	var buttonGroup = dialog.add("group");
		var helpButton;
		if (!cs2) helpButton = text(buttonGroup, "button", "help");
		group = buttonGroup.add("group");
			group.alignment = ["fill", ""];
			group.alignChildren = ["right", ""];
			var runButton = text(group, "button", "ok", {name: "ok"});
			var cancelButton = text(group, "button", "cancel", {name: "cancel"});

	// Tooltips.
	tooltip(writeTemplateCheckbox, "templateTooltip");
	tooltip(writeJsonCheckbox, "jsonTooltip");
	tooltip(trimWhitespaceCheckbox, "trimTooltip");
	tooltip(selectionOnlyCheckbox, "selectionTooltip");
	tooltip(scaleSlider, "scaleTooltip");
	tooltip(paddingSlider, "paddingTooltip");
	tooltip(imagesDirText, "imagesTooltip");
	tooltip(jsonPathText, "jsonPathTooltip");

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
		var text = jsonPathText.text ? jsonPath(jsonPathText.text) : tr("noJsonOutput");
		if (!cs2) {
			jsonPathPreview.text = text;
			jsonPathPreview.helpTip = text;
		} else
			jsonPathText.helpTip = text;
	};
	imagesDirText.onChanging = function () {
		var text = imagesDirText.text ? absolutePath(imagesDirText.text) : tr("noImageOutput");
		if (!cs2) {
			imagesDirPreview.text = text;
			imagesDirPreview.helpTip = text;
		} else
			imagesDirText.helpTip = text;
	};

	languageSelect.onChange = function () {
		var choice = languageIDs[languageSelect.selection.index];
		if (choice == settings.language) return;
		settings.language = choice;
		selectLanguage();
		saveSettings();
		var jsonHint = jsonPathText.helpTip, imagesHint = imagesDirText.helpTip;
		for (var i = 0; i < localized.length; i++) {
			var entry = localized[i];
			entry.control[entry.property] = tr(entry.key);
		}
		languageSelect.items[0].text = tr("automatic");
		// Paths are not localized; don't reparse unfinished input.
		if (!jsonPathText.text) jsonPathText.onChanging();
		else if (cs2) jsonPathText.helpTip = jsonHint;
		if (!imagesDirText.text) imagesDirText.onChanging();
		else if (cs2) imagesDirText.helpTip = imagesHint;
		dialog.layout.layout(true);
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
		settings.selectionOnly = selectionOnlyCheckbox.value;

		var scaleValue = parseFloat(scaleText.text);
		if (scaleValue > 0 && scaleValue <= 400) settings.scale = scaleValue / 100;

		settings.imagesDir = imagesDirText.text;
		settings.jsonPath = jsonPathText.text;

		var paddingValue = parseInt(paddingText.text);
		if (paddingValue >= 0) settings.padding = paddingValue;
	}

	runButton.onClick = function () {
		if (scaleText.text <= 0 || scaleText.text > 400) {
			alert(tr("scaleRange"));
			return;
		}
		if (paddingText.text < 0) {
			alert(tr("paddingRange"));
			return;
		}

		updateSettings();
		saveSettings();

		languageSelect.enabled = false;
		ignoreHiddenLayersCheckbox.enabled = false;
		ignoreBackgroundCheckbox.enabled = false;
		writeTemplateCheckbox.enabled = false;
		writeJsonCheckbox.enabled = false;
		trimWhitespaceCheckbox.enabled = false;
		selectionOnlyCheckbox.enabled = false;
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
			//var start = new Date().getTime();
			run();
			//alert((new Date().getTime() - start) / 1000 + "s");
		} catch (e) {
			if (e.number == 8007 || e.message == "User cancelled the operation") return;
			var layerMessage = lastLayerName ? tr("layerContext", lastLayerName) : "";
			alert(tr("unexpectedError", layerMessage, e.line, e.message, scriptVersion));
			debugger;
		} finally {
			if (activeDocument != originalDoc) activeDocument.close(SaveOptions.DONOTSAVECHANGES);
			app.preferences.rulerUnits = rulerUnits;
			if (progress && progress.dialog) progress.dialog.close();
			dialog.close();
		}
	};

	dialog.center();
	dialog.show();
}

function loadSettings () {
	var options;
	try {
		options = app.getCustomOptions("PhotoshopToSpine");
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
	app.putCustomOptions("PhotoshopToSpine", desc, true);
}

function getOptionType (value) {
	switch (typeof(value)) {
	case "boolean": return "Boolean";
	case "string": return "String";
	case "number": return "Double";
	};
	throw new Error(tr("invalidSetting", value));
}

// Help dialog.

function showHelpDialog () {
	var dialog = new Window("dialog", tr("helpTitle"));
	dialog.alignChildren = ["fill", ""];
	dialog.orientation = "column";
	dialog.alignment = ["", "top"];

	var helpText = dialog.add("statictext", undefined, tr("helpText"), {multiline: true});
	helpText.preferredSize.width = 325;

	var closeButton = dialog.add("button", undefined, tr("close"), {name: "ok"});
	closeButton.alignment = ["center", ""];

	closeButton.onClick = function () {
		dialog.close();
	};

	dialog.center();
	dialog.show();
}

// Progress dialog:

function showProgress (title, total) {
	title = title ? "PhotoshopToSpine - " + title : "PhotoshopToSpine";
	if (!progress) {
		var dialog = new Window("palette", title);
		dialog.alignChildren = "fill";
		dialog.orientation = "column";

		var message = dialog.add("statictext", undefined, tr("initializing"));

		var group = dialog.add("group");
			var bar = group.add("progressbar");
			bar.preferredSize = [300, 16];
			bar.maxvalue = total;
			bar.value = 1;
			var cancelButton = group.add("button", undefined, tr("cancel"), {name: "cancel"});

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

// PhotoshopToSpine utility:

function initializeLayers (context, selectedLayers, parent, parentLayers) {
	while (context.index >= context.first) {
		if (cancel) return -1;

		var id = getLayerID(context.index--);

		var selected = parent && parent.selected;
		if (selectedLayers && !selected) {
			for (var i = 0, n = selectedLayers.length; i < n; i++) {
				if (selectedLayers[i] === id) {
					selected = true;
					break;
				}
			}
		}

		var layer = new Layer(id, parent, selected);
		if (layer.isGroupEnd) break;
		context.total++;
		parentLayers.push(layer);
		if (layer.isGroup) initializeLayers(context, selectedLayers, layer, layer.layers);
	}
}

function collectLayers (parentLayers, collect, overlays) {
	outer:
	for (var i = 0, n = parentLayers.length; i < n; i++) {
		if (cancel) return;
		var layer = parentLayers[i];
		incrProgress(layer.name);

		if (settings.selectionOnly && !layer.selected) {
			var needsMerge = layer.isGroup && (layer.findTagLayer("merge") || layer.findTagLayer("overlay"));
			if (!needsMerge && layer.layers && layer.layers.length > 0)
				collectLayers(layer.layers, collect, overlays);
			else
				layer.hide();
			continue;
		}

		if (settings.ignoreHiddenLayers && !layer.visible) continue;
		if (settings.ignoreBackground && layer.background) {
			layer.hide();
			continue;
		}
		if (layer.findTagLayer("ignore")) {
			layer.hide();
			continue;
		}
		if (layer.adjustment || layer.clipping) continue;
		if (!layer.isGroup && !layer.isNormal()) {
			layer.rasterize(); // In case rasterizeAll failed.
			if (!layer.isNormal()) {
				layer.hide();
				continue;
			}
		}

		// Ensure tags are valid.
		var re = /\[([^\]]+)\]/g;
		while (true) {
			var matches = re.exec(layer.name);
			if (!matches) break;
			var tag = matches[1];
			if (layer.isGroup) {
				if (!isValidGroupTag(tag)) {
					var message = tr("invalidGroupName", layer.name);
					if (isValidLayerTag(tag))
						message += tr("layerOnlyTag", tag);
					else
						message += tr("invalidTag", tag);
					error(message);
					continue outer;
				}
			} else if (tag != "merge" && !isValidLayerTag(tag)) { // Allow merge, the user may have merged manually to save time.
				var message = tr("invalidLayerName", layer.name);
				if (isValidGroupTag(tag))
					message += tr("groupOnlyTag", tag);
				else
					message += tr("invalidTag", tag);
				error(message);
				continue outer;
			}
		}

		if (layer.findTagLayer("overlay")) {
			if (!layer.visible) continue;
			if (layer.isGroup) {
				layer.select();
				merge();
				layer = new Layer(layer.id, layer.parent, layer.selected);
			}
			layer.setLocked(false);
			layer.hide();
			overlays.push(layer);
			continue;
		}

		layer.wasVisible = layer.visible;
		layer.show();
		layer.setLocked(false);

		if (layer.isGroup && layer.findTagLayer("merge")) {
			collectGroupMerge(layer);
			if (!layer.layers || layer.layers.length == 0) continue;
		} else if (layer.layers && layer.layers.length > 0) {
			collectLayers(layer.layers, collect, overlays);
			continue;
		} else if (layer.isGroup)
			continue;

		layer.overlays = overlays.slice();
		layer.hide();
		collect.push(layer);
	}
}

function collectGroupMerge (parent) {
	var parentLayers = parent.layers;
	if (!parentLayers) return;
	for (var i = parentLayers.length - 1; i >= 0; i--) {
		var layer = parentLayers[i];
		if (settings.ignoreHiddenLayers && !layer.visible) continue;
		if (layer.findTagLayer("ignore")) {
			layer.hide();
			continue;
		}
		collectGroupMerge(layer);
	}
}

function isValidGroupTag (tag) {
	if (startsWith(tag, "name:")) return true;
	return tag == "merge" || isValidLayerTag(tag);
}

function isValidLayerTag (tag) {
	switch (tag) {
	case "bone":
	case "slot":
	case "skin":
	case "folder":
	case "ignore":
	case "overlay":
	case "trim":
	case "mesh":
		return true;
	}
	if (startsWith(tag, "bone:")) return true;
	if (startsWith(tag, "slot:")) return true;
	if (startsWith(tag, "skin:")) return true;
	if (startsWith(tag, "folder:")) return true;
	if (startsWith(tag, "path:")) return true;
	if (startsWith(tag, "scale:")) return true;
	if (startsWith(tag, "trim:")) return true;
	if (startsWith(tag, "mesh:")) return true;
	return false;
}

function stripTags (name) {
	return trim(name.replace(/\[[^\]]+\]/g, ""));
}

function jsonPath (jsonPath) {
	if (endsWith(jsonPath, ".json")) {
		var index = forwardSlashes(jsonPath).lastIndexOf("/");
		if (index != -1) return absolutePath(jsonPath.slice(0, index + 1)) + jsonPath.slice(index + 1);
		return absolutePath("./") + jsonPath;
	}
	var name = decodeURI(originalDoc.name);
	return absolutePath(jsonPath) + name.substring(0, name.indexOf(".")) + ".json";
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
	return executeActionGet(ref).getInteger(key) / 65536;
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

// Layer must be selected.
function channelBounds (name) {
	try {
		var ref1 = new ActionReference();
		ref1.putProperty(sID("channel"), sID("selection"));
		var ref2 = new ActionReference();
		ref2.putEnumerated(sID("channel"), sID("channel"), sID(name));
		var desc = new ActionDescriptor();
		desc.putReference(sID("null"), ref1);
		desc.putReference(sID("to"), ref2);
		executeAction(sID("set"), desc, DialogModes.NO);
		return activeDocument.selection.bounds;
	} catch (ignored) {}
	return null;
}

function scaleImage (scale) {
	if (scale == 1) return;
	var imageSize = activeDocument.width.as("px") * scale;
	activeDocument.resizeImage(UnitValue(imageSize, "px"), null, null, ResampleMethod.BICUBICAUTOMATIC);
}

function scaleAttachmentImage (layer, trim, scale, sourceImage) {
	var bounds = sourceImage ? sourceImage.bounds : { left: layer.left, top: layer.top, right: layer.right, bottom: layer.bottom, width: layer.width, height: layer.height };
	if (sourceImage) clipMeshImage(layer, bounds);
	var width = activeDocument.width.as("px") * settings.scale, height = activeDocument.height.as("px") * settings.scale;
	// Resize on the full canvas so trimmed frames share the same sampling grid.
	scaleImage(settings.scale * scale);
	var imageWidth = activeDocument.width.as("px"), imageHeight = activeDocument.height.as("px");
	var scaleX = width / imageWidth, scaleY = height / imageHeight;
	if (trim && !sourceImage) {
		layer.boundsDirty = true;
		layer.updateBounds();
		layer.boundsDirty = true; // History restoration will restore the unscaled layer.
	}

	// Padding must not crop pixels when Photoshop rounds the proportional height differently.
	var paddedWidth = imageWidth, paddedHeight = imageHeight;
	if (settings.padding > 0) {
		paddedWidth = Math.max(imageWidth, Math.round((width + settings.padding * 2) * scale));
		paddedHeight = Math.max(imageHeight, Math.round((height + settings.padding * 2) * scale));
	}
	var padLeft = Math.floor((paddedWidth - imageWidth) / 2), padTop = Math.floor((paddedHeight - imageHeight) / 2);
	// Split odd padding explicitly so the content offset is known.
	if (padLeft || padTop) activeDocument.resizeCanvas(UnitValue(imageWidth + padLeft, "px"), UnitValue(imageHeight + padTop, "px"), AnchorPosition.BOTTOMRIGHT);
	if (paddedWidth != imageWidth + padLeft || paddedHeight != imageHeight + padTop)
		activeDocument.resizeCanvas(UnitValue(paddedWidth, "px"), UnitValue(paddedHeight, "px"), AnchorPosition.TOPLEFT);

	var left = 0, top = 0;
	if (trim) {
		var right, bottom;
		if (sourceImage) {
			left = sourceImage.left;
			top = sourceImage.top;
			right = left + sourceImage.width;
			bottom = top + sourceImage.height;
		} else {
			// Only keep a filtering border when padding is enabled.
			var minPadding = settings.padding > 0 ? 1 : 0;
			left = Math.max(0, Math.min(paddedWidth - 1, Math.floor(layer.left) + padLeft - Math.max(minPadding, padLeft)));
			top = Math.max(0, Math.min(paddedHeight - 1, Math.floor(layer.top) + padTop - Math.max(minPadding, padTop)));
			right = Math.max(left + 1, Math.min(paddedWidth, Math.ceil(layer.right) + padLeft + Math.max(minPadding, paddedWidth - imageWidth - padLeft)));
			bottom = Math.max(top + 1, Math.min(paddedHeight, Math.ceil(layer.bottom) + padTop + Math.max(minPadding, paddedHeight - imageHeight - padTop)));
		}
		var originX = rulerOrigin("H"), originY = rulerOrigin("V");
		activeDocument.crop([UnitValue(left - originX, "px"), UnitValue(top - originY, "px"),
			UnitValue(right - originX, "px"), UnitValue(bottom - originY, "px")]);
	}

	var result = { left: left, top: top, width: activeDocument.width.as("px"), height: activeDocument.height.as("px"), scaleX: scaleX, scaleY: scaleY, bounds: bounds };
	result.x = (left + result.width / 2 - padLeft) * scaleX;
	result.y = (top + result.height / 2 - padTop) * scaleY;
	return result;
}

function clipMeshImage (layer, bounds) {
	var width = activeDocument.width.as("px"), height = activeDocument.height.as("px");
	var left = Math.max(0, Math.floor(bounds.left)), top = Math.max(0, Math.floor(bounds.top));
	var right = Math.min(width, Math.ceil(bounds.right)), bottom = Math.min(height, Math.ceil(bounds.bottom));
	if (right <= left || bottom <= top) {
		layer.select();
		activeDocument.selection.selectAll();
		activeDocument.selection.clear();
		activeDocument.selection.deselect();
		return;
	}
	var originX = rulerOrigin("H"), originY = rulerOrigin("V");
	activeDocument.crop([UnitValue(left - originX, "px"), UnitValue(top - originY, "px"),
		UnitValue(right - originX, "px"), UnitValue(bottom - originY, "px")]);
	// Clip linked pixels to the original source bounds, then restore the common sampling canvas.
	if (left || top) activeDocument.resizeCanvas(UnitValue(right, "px"), UnitValue(bottom, "px"), AnchorPosition.BOTTOMRIGHT);
	if (right != width || bottom != height)
		activeDocument.resizeCanvas(UnitValue(width, "px"), UnitValue(height, "px"), AnchorPosition.TOPLEFT);
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

function bgColor (control, r, g, b) {
	control.graphics.backgroundColor = control.graphics.newBrush(control.graphics.BrushType.SOLID_COLOR, [r, g, b]);
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

function savePNG (file) {
	// SaveForWeb changes spaces to dash. Also some users report it writes HTML.
	//var options = new ExportOptionsSaveForWeb();
	//options.format = SaveDocumentType.PNG;
	//options.PNG8 = false;
	//options.transparency = true;
	//options.interlaced = false;
	//options.includeProfile = false;
	//activeDocument.exportDocument(file, ExportType.SAVEFORWEB, options);

	// SaveAs sometimes writes a huge amount of XML in the PNG. Ignore it or use Oxipng to make smaller PNGs.
	var options = new PNGSaveOptions();
	options.compression = 6;
	activeDocument.saveAs(file, options, true, Extension.LOWERCASE);
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

function getSelectedLayers () {
	var layers = [];
	var ref = new ActionReference();
	ref.putEnumerated(cID("Dcmn"), cID("Ordn"), cID("Trgt"));
	var desc = executeActionGet(ref);
	if (desc.hasKey(sID("targetLayers"))) {
		desc = desc.getList(sID("targetLayers"));
		for (var i = 0, n = desc.count; i < n; i++)
			layers.push(getLayerID(desc.getReference(i).getIndex() + 1));
	}
	return layers;
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
	throw new Error(tr("unknownType", type));
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
		e.message = tr("cannotGetLayerProperty", this, name, e.message);
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
	executeAction(cID("Dlt "), desc, DialogModes.NO);
};

Layer.prototype.rasterize = function () {
	var ref = new ActionReference();
	ref.putIdentifier(cID("Lyr "), this.id);
	var desc = new ActionDescriptor();
	desc.putReference(cID("null"), ref);
	executeAction(sID("rasterizeLayer"), desc, DialogModes.NO);
};

Layer.prototype.rasterizeStyles = function () {
	if (!this.has("layerEffects")) return;
	this.select();
	try {
		merge(); // Merges any clipping masks.
	} catch (ignored) {}
	newLayerBelow(this.name);
	this.select(true);
	merge();
	this.boundsDirty = true;

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

Layer.prototype.updateBounds = function () {
	if (!this.boundsDirty) return;
	this.boundsDirty = false;

	var bounds;
	if (this.mask) {
		this.select();
		bounds = channelBounds("mask");
		if (bounds) {
			this.left = bounds[0].as("px");
			this.top = bounds[1].as("px");
			this.right = bounds[2].as("px");
			this.bottom = bounds[3].as("px");
		}
	}
	if (!bounds) {
		try {
			bounds = this.get("boundsNoEffects", "ObjectValue");
		} catch (e) { // CS2.
			bounds = this.get("bounds", "ObjectValue"); // Not tightly fitting if there are layer styles.
		}
		this.left = bounds.getDouble(sID("left"));
		this.top = bounds.getDouble(sID("top"));
		this.right = bounds.getDouble(sID("right"));
		this.bottom = bounds.getDouble(sID("bottom"));
	}
	this.width = this.right - this.left;
	this.height = this.bottom - this.top;
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

Layer.prototype.applyNamePatterns = function (name) {
	var layer = this.findTagLayer("name:");
	if (!layer) return name;
	var namePattern = layer.getTagValue("name:");
	if (namePattern) {
		var asterisk = namePattern.indexOf("*");
		if (asterisk == -1) {
			error(tr("invalidNamePattern", layer.name));
			return null;
		}
		name = namePattern.substring(0, asterisk) + name + namePattern.substring(asterisk + 1);
	}
	return layer.parent ? layer.parent.applyNamePatterns(name) : name;
};

Layer.prototype.findTagLayer = function (tag) {
	var groupTag = isValidGroupTag(tag), layerTag = isValidLayerTag(tag);
	if (endsWith(tag, ":")) tag = tag.slice(0, -1);
	var re = new RegExp("\\[" + tag + "(:[^\\]]+)?\\]", "i");
	var layer = this;
	while (layer) {
		if (((layer.isGroup && groupTag) || (layer.isLayer && layerTag)) && re.exec(layer.name)) return layer;
		layer = layer.parent;
	}
	return null;
};

Layer.prototype.findTagValue = function (tag, noValue) {
	var layer = this.findTagLayer(tag);
	if (!layer) return null;
	return layer.getTagValue(tag, noValue);
};

Layer.prototype.getTagValue = function (tag, noValue) {
	if (endsWith(tag, ":")) tag = tag.slice(0, -1);
	var matches = new RegExp("\\[" + tag + ":([^\\]]+)\\]", "i").exec(this.name);
	if (matches && matches.length) return trim(matches[1]);
	if (noValue) return noValue;
	return stripTags(this.name);
};

Layer.prototype.getParentBone = function (bones) {
	var parentName = this.parent ? this.parent.findTagValue("bone") : null;
	if (!parentName) parentName = "root";
	var parent = get(bones, parentName);
	if (!parent) { // Parent bone group with no attachment layers.
		var parentParent = this.parent.getParentBone(bones);
		set(bones, parentName, parent = { name: parentName, x: 0, y: 0, parent: parentParent, children: [], layer: this.parent });
		parentParent.children.push(parent);
	}
	return parent;
};

var foldersRE = new RegExp("\\[(folder|skin)(:[^\\]]+)?\\]", "i");
Layer.prototype.folders = function (path) {
	var layer = this;
	while (layer) {
		var matches = foldersRE.exec(layer.name);
		if (matches) {
			var folder = layer.findTagValue(matches[1]);
			if (matches[1] == "skin" && folder == "default") return layer.parent.folders(path);
			path = folder + "/" + path;
			if (startsWith(folder, "/")) return path;
			return layer.parent ? layer.parent.folders(path) : path;
		}
		layer = layer.parent;
	}
	return path;
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
