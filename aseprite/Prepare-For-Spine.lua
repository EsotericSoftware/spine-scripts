--[[
Aseprite to Spine Exporter Script
Written by Jordan Bleu
https://github.com/jordanbleu/aseprite-to-spine
]]

-----------------------------------------------[[ Functions ]]-----------------------------------------------
--[[
Flattens the layers of a sprite and computes each layer's export visibility.
parent: The sprite or parent layer group
outLayers: The array to append the flattened layers
outVis: The array to append the effective visibility of each layer (true / false)
groupIsVisible: The visibility inherited from parent groups (true / false)
ignoreHiddenLayers: If true, hidden layers and layers under hidden groups are excluded
]]
function flattenWithEffectiveVisibility(parent, outLayers, outVis, groupIsVisible, ignoreHiddenLayers)
    for _, layer in ipairs(parent.layers) do
        -- Determine the effective visibility of the layer based on its own visibility and the inherited visibility from parent groups
        local effectiveVisible
        if (ignoreHiddenLayers) then
            effectiveVisible = groupIsVisible and layer.isVisible
        else
            effectiveVisible = true
        end
        
        -- Append the layer and its effective visibility to the output arrays
        outLayers[#outLayers + 1] = layer
        outVis[#outVis + 1] = effectiveVisible
        
        -- If this layer is a group, recursively flatten its children, passing down the effective visibility
        if layer.isGroup then
            flattenWithEffectiveVisibility(layer, outLayers, outVis, effectiveVisible, ignoreHiddenLayers)
        end
    end
end

--[[
Checks for duplicate layer names, and returns true if any exist (also shows an error to the user)
layers: The flattened view of the sprite layers
]]
function containsDuplicates(layers, visibilities)
    local nameCounts = {} -- Map of layer name to count
    local duplicateNames = {} -- List of layer duplicates names
    -- Iterate through the layers and count the occurrences of each name among visible layers
    for i, layer in ipairs(layers) do
        if (not layer.isGroup and visibilities[i] == true and not isMarkerLayer(layer)) then
            local name = layer.name
            local count = (nameCounts[name] or 0) + 1
            nameCounts[name] = count
            if (count == 2) then
                duplicateNames[#duplicateNames + 1] = name
            end
        end
    end

    -- If any duplicates were found, show one dialog listing all duplicate names.
    if (#duplicateNames > 0) then
        table.sort(duplicateNames)
        local duplicateDialog = Dialog({ title = "Duplicate Layer Names" })
        duplicateDialog:label({
            id = "message",
            text = "Found duplicate visible layer names, Please use unique names:"
        })
        for _, duplicateName in ipairs(duplicateNames) do
            duplicateDialog:newrow()
            duplicateDialog:label({
                text = duplicateName .. " ▸ Count: " .. nameCounts[duplicateName]
            })
        end
        duplicateDialog:newrow()
        duplicateDialog:button({
            text = "OK",
            focus = true,
            onclick = function()
                duplicateDialog:close()
            end
        })
        duplicateDialog:show({ wait = true })
        return true
    end

    return false
end

--[[
Returns an array of each layer's visibility (true / false)
layers: the flattened view of the sprite layers
]]
function captureVisibilityStates(layers)
    local visibilities = {}
    for i, layer in ipairs(layers) do
        visibilities[i] = layer.isVisible
    end
    return visibilities
end

--[[
Hides all layers and groups
layers: The flattened view of the sprite layers
]]
function hideAllLayers(layers)
    for i, layer in ipairs(layers) do
        if (layer.isGroup) then
            layer.isVisible = true
        else
            layer.isVisible = false
        end
    end
end

--[[
Captures each layer as a separate PNG.  Ignores hidden layers.
layers: The flattened view of the sprite layers
sprite: The active sprite
effectiveVisibilities: the prior state of each layer's effectiveVisible visibility (true / false)
outputPath: the output json file path
clearOldImages: if true, clear existing images folder before export
originX, originY: the user-defined origin point for the exported Spine skeleton, as a percentage of the sprite's width and height (range 0-1)
roundCoordinatesToInteger: if true, rounds the attachment coordinates to the nearest integer instead of keeping decimals (not recommended for pixel art)
imageScalePercent: the scale percentage to apply to exported image resolution
imagePaddingPx: the padding to apply around each captured image, in pixels
]]
function captureLayers(
    layers, 
    sprite, 
    effectiveVisibilities, 
    outputPath, 
    clearOldImages, 
    originX, 
    originY, 
    roundCoordinatesToInteger,
    imageScalePercent,
    imagePaddingPx)
    -- Default output path to the sprite-name json in the sprite's directory.
    if (outputPath == nil or outputPath == "") then
        local defaultOutputDir = app.fs.filePath(sprite.filename)
        local defaultSpriteName = app.fs.fileTitle(sprite.filename)
        outputPath = defaultOutputDir .. app.fs.pathSeparator .. defaultSpriteName .. ".json"
    end
    local outputDir = app.fs.filePath(outputPath)
    -- Create the output images directory if it doesn't exist
    local separator = app.fs.pathSeparator
    local imagesDir = outputDir .. separator .. "images"
    -- If the user chose to clear old images, delete the existing images directory
    if (clearOldImages == true) then
        deleteDirectoryRecursive(imagesDir)
    end
    app.fs.makeDirectory(imagesDir)

    -- record any failed paths so we can show an error to the user at the end.
    local failedPaths = {}
    local function addFailedPath(path)
        if (path == nil or path == "") then
            return
        end
        for _, existing in ipairs(failedPaths) do
            if (existing == path) then
                return
            end
        end
        failedPaths[#failedPaths + 1] = path
    end
    -- Probe images directory write permission.
    local probePath = imagesDir .. separator .. ".aseprite_write_probe.tmp"
    local probeFile = io.open(probePath, "w")
    if (probeFile ~= nil) then
        probeFile:close()
        os.remove(probePath)
    else
        addFailedPath(imagesDir)
    end

    -- First hide all layers so we can selectively show them when we capture them
    hideAllLayers(layers)

    -- Create and open the output json file for writing
    local jsonFileName = outputPath
    local json = io.open(jsonFileName, "w")
    if (json == nil) then
        addFailedPath(jsonFileName)
    else
        json:write('{')
        -- skeleton
        json:write([[ "skeleton": { "images": "images/" }, ]])
        -- bones
        json:write([[ "bones": [ { "name": "root" }	], ]])
    end
    -- build arrays of json properties for skins and slots
    -- we only include layers, not groups
    local slotsJson = {}
    local skinsJson = {}
    local index = 1
    local scaleFactor = imageScalePercent / 100 -- convert from percentage to a multiplier (e.g. 100% -> 1, 50% -> 0.5, 200% -> 2)
    for i, layer in ipairs(layers) do
        -- Ignore groups and non-visible layers
        if (not layer.isGroup and effectiveVisibilities[i] == true and not isMarkerLayer(layer)) then
            -- Skip layers with no cels (empty layers)
            local cel = layer.cels[1]
            if (cel == nil) then
                goto continue
            end
            -- Set the layer to visible so we can capture it, then set it back to hidden after
            layer.isVisible = true
            local imagePath = imagesDir .. separator .. layer.name .. ".png"
            local savedOk = false
            savedOk = pcall(function()
                local cropped = Sprite(sprite)
                local cropX = cel.position.x - imagePaddingPx
                local cropY = cel.position.y - imagePaddingPx
                local cropWidth = cel.bounds.width + imagePaddingPx * 2
                local cropHeight = cel.bounds.height + imagePaddingPx * 2
                cropped:crop(cropX, cropY, cropWidth, cropHeight)

                local scaledWidth = math.max(1, math.floor(cropWidth * scaleFactor + 0.5))
                local scaledHeight = math.max(1, math.floor(cropHeight * scaleFactor + 0.5))
                if (scaledWidth ~= cropWidth or scaledHeight ~= cropHeight) then
                    cropped:resize(scaledWidth, scaledHeight)
                end

                cropped:flatten()
                cropped:saveCopyAs(imagePath)
                cropped:close()
            end)
            if (savedOk ~= true) then
                addFailedPath(imagePath)
            end
            layer.isVisible = false
            local name = layer.name
            -- Calculate the attachment position based on the cel position, cel bounds, sprite bounds, and the user-defined originX and originY.
            local attachmentX = cel.bounds.width / 2 + cel.position.x - sprite.bounds.width * originX
            local attachmentY = sprite.bounds.height * (1 - originY) - cel.position.y - cel.bounds.height / 2
            attachmentX = attachmentX * scaleFactor
            attachmentY = attachmentY * scaleFactor
            slotsJson[index] = string.format([[ { "name": "%s", "bone": "%s", "attachment": "%s" } ]], name, "root", name)
            -- If roundCoordinatesToInteger is true, round the attachmentX and attachmentY to the nearest integer.  Otherwise, keep the decimal values with 3 decimal places.
            if (roundCoordinatesToInteger == true) then
                attachmentX = math.floor(attachmentX + 0.5)
                attachmentY = math.floor(attachmentY + 0.5)
                skinsJson[index] = string.format([[ "%s": { "%s": { "x": %d, "y": %d, "width": 1, "height": 1 } } ]], name, name, attachmentX, attachmentY)
            else
                skinsJson[index] = string.format([[ "%s": { "%s": { "x": %.3f, "y": %.3f, "width": 1, "height": 1 } } ]], name, name, attachmentX, attachmentY)
            end
            index = index + 1
            ::continue::
        end
    end

    -- slots
    if (json ~= nil) then
        json:write('"slots": [')
        json:write(table.concat(slotsJson, ","))
        json:write("],")
        -- skins
        json:write('"skins": {')
        json:write('"default": {')
        json:write(table.concat(skinsJson, ","))
        json:write('}')
        json:write('}')

        -- close the json
        json:write("}")
        json:close()
    end

    -- Show export completion dialog
    showExportCompletedDialog(jsonFileName, failedPaths)
end

--[[
Restores layers to their previous visibility state
layers: The flattened view of the sprite layers
visibilityStates: the prior state of each layer's visibility (true / false)
]]
function restoreVisibilities(layers, visibilityStates)
    for i, layer in ipairs(layers) do
        layer.isVisible = visibilityStates[i]
    end
end

--[[
Deletes a directory and its contents recursively.
path: The path of the directory to delete
]]
function deleteDirectoryRecursive(path)
    if (path == nil or path == "") then
        return
    end
    if (not app.fs.isDirectory(path)) then
        return
    end

    for _, name in ipairs(app.fs.listFiles(path)) do
        local fullPath = app.fs.joinPath(path, name)
        if (app.fs.isDirectory(fullPath)) then
            deleteDirectoryRecursive(fullPath)
        else
            os.remove(fullPath)
        end
    end
    os.remove(path)
end



--#region Layer Marker Functions

--[[
Finds the first non-group layer whose name contains [] marker text by recursive layer order.
parent: The sprite or parent layer group
markerName: Marker text name to match inside [] (case-insensitive)
]]
function findFirstMarkerLayer(parent, markerName)
    for _, layer in ipairs(parent.layers) do
        if (isMarkerLayer(layer)) then
            if (markerName == nil or markerName == "" or hasMarkerName(layer.name, markerName)) then
                return layer
            end
        end
        if (layer.isGroup) then
            local found = findFirstMarkerLayer(layer, markerName)
            if (found ~= nil) then
                return found
            end
        end
    end
    return nil
end

--[[
Returns true when a layer is a non-group marker layer.
layer: the layer to check
]]
function isMarkerLayer(layer)
    if (layer == nil or layer.isGroup) then
        return false
    end
    
    if (layer.name == nil) then
        return false
    end

    return string.find(layer.name, "%b[]") ~= nil
end

--[[
Returns true when layerName contains the exact marker text inside [] (case-insensitive).
layerName: the layer name to check for the marker text
markerName: the marker text to match inside [] (case-insensitive)
]]
function hasMarkerName(layerName, markerName)
    if (layerName == nil or markerName == nil or markerName == "") then
        return false
    end

    local escapedMarker = string.gsub(string.lower(markerName), "([%^%$%(%)%%%.%[%]%*%+%-%?])", "%%%1")
    local markerPattern = "%[" .. escapedMarker .. "%]"
    return string.find(string.lower(layerName), markerPattern) ~= nil
end

--[[
Gets marker-center coordinates as origin values in the requested mode.
sprite: the sprite to search for marker layers
mode: the origin mode to return values in (ORIGIN_MODE.PIXEL or ORIGIN_MODE.NORMALIZED)
]]
function getOriginFromMarkerLayer(sprite, mode)
    if (sprite == nil) then
        return nil, nil
    end
    -- Find the first non-group layer whose name contains [origin] by recursive layer order.
    local markerLayer = findFirstMarkerLayer(sprite, "origin")
    if (markerLayer == nil or markerLayer.cels == nil or #markerLayer.cels == 0) then
        return nil, nil
    end
    -- Calculate the center of the cel bounds as the marker position, and convert to the requested mode.
    local cel = markerLayer.cels[1]
    if (cel == nil or cel.bounds == nil or cel.position == nil) then
        return nil, nil
    end
    local spriteWidth, spriteHeight = getActiveSpriteSize()
    local centerX = cel.bounds.x + cel.bounds.width * 0.5
    local centerYFromTop = cel.bounds.y + cel.bounds.height * 0.5
    local pixelYFromBottom = spriteHeight - centerYFromTop

    -- Clamp the returned values to valid ranges for the selected mode, in case the marker layer is placed outside the sprite bounds.
    if (mode == ORIGIN_MODE.PIXEL) then
        return clampValue(centerX, 0, spriteWidth), clampValue(pixelYFromBottom, 0, spriteHeight)
    elseif (mode == ORIGIN_MODE.NORMALIZED) then
        return clampValue(centerX / spriteWidth, 0, 1), clampValue(pixelYFromBottom / spriteHeight, 0, 1)
    end

    return nil, nil
end
--#endregion


-----------------------------------------------[[ UI Functions ]]-----------------------------------------------
--[[
Shows the export options dialog and returns the selected options.
]]
function showExportOptionsDialog()
    -- Create a dialog to show export optionsDialog
    local optionsDialog = Dialog({ title = "Export To Spine v1.3" })

    -- Load cached options or use defaults if no cache exists
    local activeSprite = app.activeSprite
    local spriteWidth, spriteHeight = getActiveSpriteSize()
    local spriteOutputDir = app.fs.filePath(activeSprite.filename)
    local spriteOutputName = app.fs.fileTitle(activeSprite.filename)
    local defaultOutputPath = spriteOutputDir .. app.fs.pathSeparator .. spriteOutputName .. ".json"
    local cachedOptions, configPath = loadCachedOptions(defaultOutputPath)
    
    -- Draw the Spine logo at the top.
    DrawSpineLogo(optionsDialog)

    --#region Other Buttons
    -- button: Resets all options to their default values
    optionsDialog:button({
        text = "Reset Config",
        onclick = function()
            setOriginMode(optionsDialog, ORIGIN_MODE.NORMALIZED)
            setOriginPreset(optionsDialog, "bottom-center")
            optionsDialog:modify({ id = "imageScalePercent", text = string.format("%.3f", 100) })
            optionsDialog:modify({ id = "imageScaleSlider", value = IMAGE_SCALE_SLIDER_MAX / 10 })
            optionsDialog:modify({ id = "imagePaddingPx", text = string.format("%.0f", 1) })
            optionsDialog:modify({ id = "imagePaddingSlider", value = 1 })
            optionsDialog:modify({ id = "roundCoordinatesToInteger", selected = false })
            optionsDialog:modify({ id = "outputPath", text = defaultOutputPath })
            optionsDialog:modify({ id = "ignoreHiddenLayers", selected = true })
            optionsDialog:modify({ id = "clearOldImages", selected = false })
            optionsDialog:repaint()
            app:refresh()
        end
    })

    optionsDialog:separator({})
    --#endregion

    --#region Coordinate Settings
    optionsDialog:label({
        id = "coordinateSettings",
        label = "Coordinate Settings",
        text = "Set which position is used as the Spine origin (0,0). Range: [0,1]."
    })
    optionsDialog:newrow()
    -- label: Shows whether the origin was set from the [origin] marker layer.
    optionsDialog:label({
        id = "originMarkerStatus"
    })

    -- radio: Option to choose between normalized coordinates (0-1) or pixel-based coordinates
    optionsDialog:radio({
        id = "originModeNormalized",
        label = "Origin Mode",
        text = ORIGIN_MODE.NORMALIZED,
        selected = cachedOptions.originMode == ORIGIN_MODE.NORMALIZED,
        onclick = function()
            setOriginMode(optionsDialog, ORIGIN_MODE.NORMALIZED)
        end
    })
    optionsDialog:radio({
        id = "originModePixel",
        text = ORIGIN_MODE.PIXEL,
        selected = cachedOptions.originMode == ORIGIN_MODE.PIXEL,
        onclick = function()
            setOriginMode(optionsDialog, ORIGIN_MODE.PIXEL)
        end
    })
    
    -- number + slider: Coordinate origin X and Y.
    optionsDialog:number({
        id = "originX",
        label = "Origin (X,Y)",
        text = string.format("%.3f", cachedOptions.originX),
        decimals = 3,
        onchange = function()
            clampOriginXyFieldValue(optionsDialog)
        end
    })
    :number({
        id = "originY",
        text = string.format("%.3f", cachedOptions.originY),
        decimals = 3,
        onchange = function()
            clampOriginXyFieldValue(optionsDialog)
        end
    })
    :slider({
        id = "originXSlider",
        min = 0,
        max = ORIGIN_SLIDER_STEPS,
        value = 0,
        onchange = function()
            syncOriginSlidersToFields(optionsDialog)
        end
    })
    :slider({
        id = "originYSlider",
        min = 0,
        max = ORIGIN_SLIDER_STEPS,
        value = 0,
        onchange = function()
            syncOriginSlidersToFields(optionsDialog)
        end
    })
    -- Set the initial state of the origin mode radio buttons based on cached options.
    setOriginMode(optionsDialog, cachedOptions.originMode)
    -- Set the initial state of the origin X and Y fields and sliders based on cached options.
    setOriginXyValues(optionsDialog, cachedOptions.originX, cachedOptions.originY)

    -- button: Presets for common origin settings (center, bottom-center, bottom-left, top-left)
    optionsDialog:newrow()
    optionsDialog:button({
        text = "Center",
        onclick = function()
            setOriginPreset(optionsDialog, "center")
        end
    })
    optionsDialog:button({
        text = "Bottom-Center",
        onclick = function()
            setOriginPreset(optionsDialog, "bottom-center")
        end
    })
    optionsDialog:button({
        text = "Bottom-Left",
        onclick = function()
            setOriginPreset(optionsDialog, "bottom-left")
        end
    })
    optionsDialog:button({
        text = "Top-Left",
        onclick = function()
            setOriginPreset(optionsDialog, "top-left")
        end
    })
    optionsDialog:newrow()

    -- check: Option to round attachment coordinates to integers instead of keeping decimals
    optionsDialog:check({
        id = "roundCoordinatesToInteger",
        label = "Round To Integer",
        text = "Drop decimal pixels, May misalign pixels; not recommended for pixel art.",
        selected = cachedOptions.roundCoordinatesToInteger
    })

    optionsDialog:separator({})

    -- Override origin values from the first [origin] marker layer if present.
    local markerOriginX, markerOriginY = getOriginFromMarkerLayer(activeSprite, getOriginMode())
    local markerOriginApplied = markerOriginX ~= nil and markerOriginY ~= nil
    if (markerOriginApplied) then
        setOriginXyValues(optionsDialog, markerOriginX, markerOriginY)
    end
    -- Set the label to show whether the origin was set from the [origin] marker layer.
    optionsDialog:modify({
        id = "originMarkerStatus",
        text = markerOriginApplied and "✅ Origin set from [origin] marker layer." or "⚪ Origin not set from [origin] marker layer."
    })
    --#endregion

    --#region Image Settings
    optionsDialog:label({
        id = "imageSettings",
        label = "Image Settings",
        text = "Configure output image transform settings."
    })

    -- number + slider: Image scale as a percentage, where 100% means the same size as the original sprite.
    optionsDialog:number({
        id = "imageScalePercent",
        label = "Scale (%)",
        text = string.format("%.3f", cachedOptions.imageScalePercent),
        decimals = 3,
        onchange = function()
            clampImageScaleFieldValue(optionsDialog)
        end
    })
    :slider({
        id = "imageScaleSlider",
        min = 0,
        max = IMAGE_SCALE_SLIDER_MAX,
        onchange = function()
            syncImageScaleSliderToField(optionsDialog)
        end
    })
    syncImageScaleSliderFromField(optionsDialog)
    optionsDialog:newrow()

    -- number + slider: Image padding in pixels.
    optionsDialog:number({
        id = "imagePaddingPx",
        label = "Padding (px)",
        text = string.format("%.0f", cachedOptions.imagePaddingPx),
        decimals = 0,
        onchange = function()
            clampImagePaddingFieldValue(optionsDialog)
        end
    })
    :slider({
        id = "imagePaddingSlider",
        min = 0,
        max = IMAGE_PADDING_SLIDER_MAX,
        onchange = function()
            syncImagePaddingSliderToField(optionsDialog)
        end
    })
    syncImagePaddingSliderFromField(optionsDialog)

    optionsDialog:separator({})
    --#endregion

    --#region Output Settings
    optionsDialog:label({
        id = "outputSettings",
        label = "Output Settings",
        text = "Configure the export JSON and image paths, and set output behavior."
    })
    -- entry: Output json path
    optionsDialog:entry({
        id = "outputPath",
        label = "Output Path",
        text = cachedOptions.outputPath
    })
    -- file: File picker to select output json path (syncs with entry)
    optionsDialog:file({
        id = "outputPathPicker",
        title = "Select Output Path",
        filename = cachedOptions.outputPath,
        text = "Select Output Path",
        save = true,
        onchange = function()
            local selectedPath = optionsDialog.data.outputPathPicker
            if (selectedPath ~= nil and selectedPath ~= "") then
                optionsDialog:modify({ id = "outputPath", text = selectedPath })
            end
        end
    })

    -- check: Option to skip exporting hidden layers (including layers under hidden groups)
    optionsDialog:check({
        id = "ignoreHiddenLayers",
        label = "Ignore Hidden Layers",
        text = "Hidden layers and layers under hidden groups will not be output.",
        selected = cachedOptions.ignoreHiddenLayers
    })

    -- check: Option to clear old images in the output images directory before export
    optionsDialog:check({
        id = "clearOldImages",
        label = "Clear Old Images",
        text = "Delete existing images first, including leftovers from removed layers.",
        selected = cachedOptions.clearOldImages
    })

    optionsDialog:separator({})
    --#endregion

    --#region Execution Buttons
    -- button: Confirm export
    local confirmed = false
    optionsDialog:button({
        text = "Export",
        focus = true,
        onclick = function()
            confirmed = true
            optionsDialog:close()
        end
    })

    -- button: Cancel export
    optionsDialog:button({
        text = "Cancel",
        onclick = function()
            optionsDialog:close()
        end
    })
    --#endregion

    --#region Show MainUI
    -- Delay one frame before refreshing so the logo canvas gets painted reliably.
    local firstFrameRefreshTimer
    firstFrameRefreshTimer = Timer({
        interval = 1 / 60,
        ontick = function()
            if (firstFrameRefreshTimer ~= nil) then
                firstFrameRefreshTimer:stop()
            end
            optionsDialog:repaint()
            app:refresh()
        end
    })
    firstFrameRefreshTimer:start()

    -- Show the dialog and wait for user input.
    optionsDialog:show({ wait = true})
    --#endregion

    --#region options Data Extraction
    -- Get the selected options
    local options = optionsDialog.data
    options.originMode = getOriginMode()
    -- Fallback to default path when input is empty.
    if (options.outputPath == nil or options.outputPath == "") then
        options.outputPath = defaultOutputPath
    end
    -- Parse originX and originY as numbers, and fallback to defaults if parsing fails or values are out of range.
    if (options.originMode ~= ORIGIN_MODE.PIXEL and options.originMode ~= ORIGIN_MODE.NORMALIZED) then
        options.originMode = ORIGIN_MODE.NORMALIZED
    end
    local parsedOriginX = tonumber(options.originX)
    local parsedOriginY = tonumber(options.originY)
    if (options.originMode == ORIGIN_MODE.PIXEL) then
        options.originX = clampValue(parsedOriginX or (spriteWidth * 0.5), 0, spriteWidth)
        options.originY = clampValue(parsedOriginY or 0, 0, spriteHeight)
    elseif (options.originMode == ORIGIN_MODE.NORMALIZED) then
        options.originX = clampValue(parsedOriginX or 0.5, 0, 1)
        options.originY = clampValue(parsedOriginY or 0, 0, 1)
    end
    -- Parse imageScalePercent as a number, and fallback to default if parsing fails or value is out of range.
    local parsedImageScalePercent = tonumber(options.imageScalePercent)
    options.imageScalePercent = clampValue(parsedImageScalePercent or 100, 0, IMAGE_SCALE_VALUE_MAX)
    -- Parse imagePaddingPx as a number, and fallback to default if parsing fails or value is out of range.
    local parsedImagePaddingPx = tonumber(options.imagePaddingPx)
    options.imagePaddingPx = clampValue(math.floor((parsedImagePaddingPx or 1) + 0.5), 0, IMAGE_PADDING_INPUT_MAX)

    -- Save the options to cache so they will be remembered next time the dialog is opened.
    saveCachedOptions(configPath, options)
    --#endregion

    -- If the user did not confirm the export (clicked Cancel or closed the dialog), return nil.
    if (not confirmed) then
        return nil
    end

    return options
end

--#region Info Dialog Functions

--[[
Shows export completion dialog with action to open the exported file location.
jsonFileName: The exported json file path.
failedPaths: The list of file/directory paths that failed to write.
]]
function showExportCompletedDialog(jsonFileName, failedPaths)
    local completedDialog = Dialog({ title = "Export Completed" })

    -- Show the exported file path
    completedDialog:label({
        id = "message",
        text = "Export completed! Use this file for importing into Spine:"
    })
    completedDialog:newrow()
    completedDialog:label({
        text = jsonFileName
    })

    -- If there were any failed paths, show an error message and list the failed paths.
    if failedPaths ~= nil and #failedPaths > 0 then
        completedDialog:newrow()
        completedDialog:label({
            text = "Failed to write:"
        })
        -- List each failed path.
        for _, path in ipairs(failedPaths) do
            completedDialog:newrow()
            completedDialog:label({
                text = path
            })
        end
    end

    completedDialog:newrow()
    -- Button to close the dialog.
    completedDialog:button({
        text = "OK",
        focus = true,
        onclick = function()
            completedDialog:close()
        end
    })

    completedDialog:show({ wait = true })
end
--#endregion

--#region Coordinates Settings Functions
ORIGIN_MODE = {
    NORMALIZED = "Normalized", -- Normalized origin coordinates in the range [0,1], where (0,0) is the bottom-left.
    PIXEL = "Pixel", -- Pixel-based origin coordinates, where (0,0) is the bottom-left of the sprite and values are in pixels.
}
CURRENT_ORIGIN_MODE = nil
ORIGIN_SLIDER_STEPS = 100
ORIGIN_SLIDER_IS_SYNCING = false

--[[
Gets the currently selected origin mode from the options dialog.
optionsDialog: The export options dialog instance
]]
function getOriginMode()
    return CURRENT_ORIGIN_MODE
end

--[[
Sets the selected origin mode radio button in the options dialog based on the given mode.
optionsDialog: The export options dialog instance
mode: The origin mode to select (ORIGIN_MODE.PIXEL or ORIGIN_MODE.NORMALIZED)
]]
function setOriginMode(optionsDialog, mode)
    -- If the mode is the same as the current mode, no need to update.
    if (CURRENT_ORIGIN_MODE == mode) then
        return
    end
    CURRENT_ORIGIN_MODE = mode

    -- Update the selected state of the origin mode radio buttons based on the given mode.
    optionsDialog:modify({ id = "originModeNormalized", selected = mode == ORIGIN_MODE.NORMALIZED })
    optionsDialog:modify({ id = "originModePixel", selected = mode == ORIGIN_MODE.PIXEL })
    -- When the origin mode changes, convert the current originX and originY values to the new mode.
    convertOriginCoordinatesByMode(optionsDialog, mode)

    -- Update the coordinate settings label to show the valid input range for the selected origin mode.
    if (mode == ORIGIN_MODE.PIXEL) then
        local spriteWidth, spriteHeight = getActiveSpriteSize()
        optionsDialog:modify({
            id = "coordinateSettings",
            text = string.format("Set Spine origin(0,0) in pixels. Range X:[0,%.0f], Y:[0,%.0f]", spriteWidth, spriteHeight)
        })
    elseif (mode == ORIGIN_MODE.NORMALIZED) then
        optionsDialog:modify({
            id = "coordinateSettings",
            text = "Set Spine origin(0,0) in normalized coordinates. Range: [0,1]"
        })
    end
end

--[[
Set originX and originY field values.
optionsDialog: The export options dialog instance
x: The preset origin X value to set
y: The preset origin Y value to set
]]
function setOriginXyValues(optionsDialog, x, y)
    optionsDialog:modify({ id = "originX", text = string.format(x) })
    optionsDialog:modify({ id = "originY", text = string.format(y) })
    clampOriginXyFieldValue(optionsDialog)
end

--[[
Converts current origin coordinates in the options dialog between normalized and pixel modes.
optionsDialog: The export options dialog instance
toMode: The target mode
]]
function convertOriginCoordinatesByMode(optionsDialog, toMode)
    local spriteWidth, spriteHeight = getActiveSpriteSize()
    if (spriteWidth == nil or spriteWidth <= 0) then
        spriteWidth = 1
    end
    if (spriteHeight == nil or spriteHeight <= 0) then
        spriteHeight = 1
    end

    local originX = tonumber(optionsDialog.data.originX)
    local originY = tonumber(optionsDialog.data.originY)

    if (originX == nil) then
        if (toMode == ORIGIN_MODE.PIXEL) then
            originX = 0.5
        else
            originX = spriteWidth * 0.5
        end
    end
    if (originY == nil) then
        originY = 0
    end

    local convertedX
    local convertedY
    if (toMode == ORIGIN_MODE.PIXEL) then
        convertedX = originX * spriteWidth
        convertedY = originY * spriteHeight
    else
        convertedX = originX / spriteWidth
        convertedY = originY / spriteHeight
    end

    setOriginXyValues(optionsDialog, convertedX, convertedY)
end

--[[
Clamps the originX and originY fields in the options dialog to valid ranges based on the selected origin mode.
optionsDialog: The export options dialog instance
]]
function clampOriginXyFieldValue(optionsDialog)
    -- Determine the valid range for originX and originY based on the selected origin mode
    local spriteWidth, spriteHeight = getActiveSpriteSize()
    local mode = getOriginMode()
    local maxX = mode == ORIGIN_MODE.PIXEL and spriteWidth or 1
    local maxY = mode == ORIGIN_MODE.PIXEL and spriteHeight or 1

    -- Parse the current values of originX and originY, and fallback to defaults if parsing fails
    local parsedX = tonumber(optionsDialog.data.originX)
    local parsedY = tonumber(optionsDialog.data.originY)
    if (parsedX == nil) then
        parsedX = mode == ORIGIN_MODE.PIXEL and (spriteWidth * 0.5) or 0.5
    end
    if (parsedY == nil) then
        parsedY = 0
    end

    local clampedX = clampValue(parsedX, 0, maxX)
    local clampedY = clampValue(parsedY, 0, maxY)
    optionsDialog:modify({ id = "originX", text = string.format("%.3f", clampedX) })
    optionsDialog:modify({ id = "originY", text = string.format("%.3f", clampedY) })

    -- After clamping the field values, also update the slider positions to match the clamped values.
    syncOriginSlidersFromFields(optionsDialog)
end

--[[
Sets the originX and originY fields in the options dialog to preset values based on common Spine origin settings.
optionsDialog: The export options dialog instance
presetName: The name of the preset to apply ("center", "bottom-center", "top-left", "bottom-left")
]]
function setOriginPreset(optionsDialog, presetName)
    local spriteWidth, spriteHeight = getActiveSpriteSize()
    local mode = getOriginMode()

    local x = 0
    local y = 0
    if (presetName == "center") then
        if (mode == ORIGIN_MODE.PIXEL) then
            x = spriteWidth * 0.5
            y = spriteHeight * 0.5
        else
            x = 0.5
            y = 0.5
        end
    elseif (presetName == "bottom-center") then
        if (mode == ORIGIN_MODE.PIXEL) then
            x = spriteWidth * 0.5
            y = 0
        else
            x = 0.5
            y = 0
        end
    elseif (presetName == "top-left") then
        if (mode == ORIGIN_MODE.PIXEL) then
            x = 0
            y = spriteHeight
        else
            x = 0
            y = 1
        end
    elseif (presetName == "bottom-left") then
        if (mode == ORIGIN_MODE.PIXEL) then
            x = 0
            y = 0
        else
            x = 0
            y = 0
        end
    end

    setOriginXyValues(optionsDialog, x, y)
end

--[[
Converts origin coordinates to normalized values based on the selected origin mode.
mode: The origin mode (ORIGIN_MODE.PIXEL or ORIGIN_MODE.NORMALIZED)
originX: The X coordinate of the origin
originY: The Y coordinate of the origin
]]
function getNormalizeOriginCoordinates(mode, originX, originY)
    -- If the mode is PIXEL, convert the pixel-based originX and originY to normalized coordinates.
    if (mode == ORIGIN_MODE.PIXEL) then
        local spriteWidth, spriteHeight = getActiveSpriteSize()
        if (spriteWidth == nil or spriteWidth <= 0) then
            spriteWidth = 1
        end
        if (spriteHeight == nil or spriteHeight <= 0) then
            spriteHeight = 1
        end

        local normalizedX = clampValue((originX or 0) / spriteWidth, 0, 1)
        local normalizedY = clampValue((originY or 0) / spriteHeight, 0, 1)
        return normalizedX, normalizedY
    end

    return clampValue(originX or 0.5, 0, 1), clampValue(originY or 0, 0, 1)
end

--[[
Clamps a value between a minimum and maximum range.
value: The value to clamp
minValue: The minimum allowed value
maxValue: The maximum allowed value
]]
function clampValue(value, minValue, maxValue)
    if (value < minValue) then
        return minValue
    elseif (value > maxValue) then
        return maxValue
    end
    return value
end

-- Returns the width and height of the active sprite, or 0 if no active sprite is found.
function getActiveSpriteSize()
    local activeSprite = app.activeSprite
    local spriteWidth = 0
    local spriteHeight = 0
    if (activeSprite ~= nil and activeSprite.bounds ~= nil) then
        spriteWidth = activeSprite.bounds.width
        spriteHeight = activeSprite.bounds.height
    end
    return spriteWidth, spriteHeight
end

--#region Origin Coordinate Sliders Functions

-- Syncs the slider positions from current originX/originY input values.
function syncOriginSlidersFromFields(optionsDialog)
    if (ORIGIN_SLIDER_IS_SYNCING) then
        return
    end

    local spriteWidth, spriteHeight = getActiveSpriteSize()
    local mode = getOriginMode()
    local maxX = mode == ORIGIN_MODE.PIXEL and spriteWidth or 1
    local maxY = mode == ORIGIN_MODE.PIXEL and spriteHeight or 1

    if (maxX <= 0) then
        maxX = 1
    end
    if (maxY <= 0) then
        maxY = 1
    end

    local x = tonumber(optionsDialog.data.originX)
    local y = tonumber(optionsDialog.data.originY)
    if (x == nil) then
        x = mode == ORIGIN_MODE.PIXEL and (spriteWidth * 0.5) or 0.5
    end
    if (y == nil) then
        y = 0
    end

    ORIGIN_SLIDER_IS_SYNCING = true
    optionsDialog:modify({ id = "originXSlider", value = toOriginSliderValue(x, maxX) })
    optionsDialog:modify({ id = "originYSlider", value = toOriginSliderValue(y, maxY) })
    ORIGIN_SLIDER_IS_SYNCING = false
end

-- Syncs the originX and originY input fields from the current slider positions.
function syncOriginSlidersToFields(optionsDialog)
    if (ORIGIN_SLIDER_IS_SYNCING) then
        return
    end

    local spriteWidth, spriteHeight = getActiveSpriteSize()
    local mode = getOriginMode()
    local maxX = mode == ORIGIN_MODE.PIXEL and spriteWidth or 1
    local maxY = mode == ORIGIN_MODE.PIXEL and spriteHeight or 1

    if (maxX <= 0) then
        maxX = 1
    end
    if (maxY <= 0) then
        maxY = 1
    end

    local sliderX = tonumber(optionsDialog.data.originXSlider) or 0
    local sliderY = tonumber(optionsDialog.data.originYSlider) or 0

    ORIGIN_SLIDER_IS_SYNCING = true
    local x = fromOriginSliderValue(sliderX, maxX)
    local y = fromOriginSliderValue(sliderY, maxY)
    setOriginXyValues(optionsDialog, x, y)
    ORIGIN_SLIDER_IS_SYNCING = false
end

-- Converts a coordinate value into slider step value based on current mode range.
function toOriginSliderValue(value, maxValue)
    if (maxValue == nil or maxValue <= 0) then
        maxValue = 1
    end
    local normalized = clampValue((value or 0) / maxValue, 0, 1)
    return math.floor(normalized * ORIGIN_SLIDER_STEPS + 0.5)
end

-- Converts a slider step value back into coordinate value based on current mode range.
function fromOriginSliderValue(sliderValue, maxValue)
    if (maxValue == nil or maxValue <= 0) then
        maxValue = 1
    end
    local step = clampValue(sliderValue or 0, 0, ORIGIN_SLIDER_STEPS)
    local normalized = step / ORIGIN_SLIDER_STEPS
    return normalized * maxValue
end
--#endregion
--#endregion

--#region Image Settings Functions
IMAGE_SCALE_SLIDER_MAX = 1000
IMAGE_SCALE_SLIDER_IS_SYNCING = false
IMAGE_SCALE_VALUE_MAX = 10000
IMAGE_PADDING_SLIDER_MAX = 4
IMAGE_PADDING_IS_SYNCING = false
IMAGE_PADDING_INPUT_MAX = 100

--#region Image Scale Slider Functions

-- Clamps the image scale input to a minimum of 0 and updates the slider state.
function clampImageScaleFieldValue(optionsDialog)
    local parsedScale = tonumber(optionsDialog.data.imageScalePercent)
    if (parsedScale == nil) then
        parsedScale = 100
    end
    local clampedScale = clampValue(parsedScale, 0, IMAGE_SCALE_VALUE_MAX)
    optionsDialog:modify({ id = "imageScalePercent", text = string.format("%.3f", clampedScale) })
    syncImageScaleSliderFromField(optionsDialog)
end

-- Syncs slider value from the scale input field; input above slider max keeps slider at max.
function syncImageScaleSliderFromField(optionsDialog)
    if (IMAGE_SCALE_SLIDER_IS_SYNCING) then
        return
    end

    local parsedScale = tonumber(optionsDialog.data.imageScalePercent)
    if (parsedScale == nil) then
        parsedScale = 100
    end
    local clampedScale = clampValue(parsedScale, 0, IMAGE_SCALE_VALUE_MAX)
    local sliderValue = clampValue(math.floor(clampedScale + 0.5), 0, IMAGE_SCALE_SLIDER_MAX)

    IMAGE_SCALE_SLIDER_IS_SYNCING = true
    optionsDialog:modify({ id = "imageScaleSlider", value = sliderValue })
    IMAGE_SCALE_SLIDER_IS_SYNCING = false
end

-- Syncs the scale input field from the slider value.
function syncImageScaleSliderToField(optionsDialog)
    if (IMAGE_SCALE_SLIDER_IS_SYNCING) then
        return
    end

    local sliderValue = tonumber(optionsDialog.data.imageScaleSlider) or 0
    sliderValue = clampValue(sliderValue, 0, IMAGE_SCALE_SLIDER_MAX)

    IMAGE_SCALE_SLIDER_IS_SYNCING = true
    optionsDialog:modify({ id = "imageScalePercent", text = string.format("%.3f", sliderValue) })
    IMAGE_SCALE_SLIDER_IS_SYNCING = false
end
--#endregion

--#region Image Padding Slider Functions

-- Clamps the image padding input to [0,100] and updates the slider state.
function clampImagePaddingFieldValue(optionsDialog)
    local parsedPadding = tonumber(optionsDialog.data.imagePaddingPx)
    if (parsedPadding == nil) then
        parsedPadding = 0
    end
    local clampedPadding = clampValue(math.floor(parsedPadding + 0.5), 0, IMAGE_PADDING_INPUT_MAX)
    optionsDialog:modify({ id = "imagePaddingPx", text = string.format("%.0f", clampedPadding) })
    syncImagePaddingSliderFromField(optionsDialog)
end

-- Syncs padding slider value from the input field; input above slider max keeps slider at max.
function syncImagePaddingSliderFromField(optionsDialog)
    if (IMAGE_PADDING_IS_SYNCING) then
        return
    end

    local parsedPadding = tonumber(optionsDialog.data.imagePaddingPx)
    if (parsedPadding == nil) then
        parsedPadding = 0
    end
    local clampedPadding = clampValue(math.floor(parsedPadding + 0.5), 0, IMAGE_PADDING_INPUT_MAX)
    local sliderValue = clampValue(clampedPadding, 0, IMAGE_PADDING_SLIDER_MAX)

    IMAGE_PADDING_IS_SYNCING = true
    optionsDialog:modify({ id = "imagePaddingSlider", value = sliderValue })
    IMAGE_PADDING_IS_SYNCING = false
end

-- Syncs the padding input field from the slider value.
function syncImagePaddingSliderToField(optionsDialog)
    if (IMAGE_PADDING_IS_SYNCING) then
        return
    end

    local sliderValue = tonumber(optionsDialog.data.imagePaddingSlider) or 0
    sliderValue = clampValue(math.floor(sliderValue + 0.5), 0, IMAGE_PADDING_SLIDER_MAX)

    IMAGE_PADDING_IS_SYNCING = true
    optionsDialog:modify({ id = "imagePaddingPx", text = string.format("%.0f", sliderValue) })
    IMAGE_PADDING_IS_SYNCING = false
end
--#endregion
--#endregion

--#region Config Caching Functions

--[[
Parses a string boolean value.
value: The string to parse ("true" or "false")
fallback: The value to return if parsing fails (not "true" or "false")
]]
function parseBool(value, fallback)
    if (value == "true") then
        return true
    elseif (value == "false") then
        return false
    end
    return fallback
end

--[[
Loads cached UI options from disk.
defaultOutputPath: The default output path to use if no cached path is found
]]
function loadCachedOptions(defaultOutputPath)
    local cached = {
        originX = 0.5,
        originY = 0,
        imageScalePercent = 100,
        imagePaddingPx = 1,
        originMode = ORIGIN_MODE.NORMALIZED,
        roundCoordinatesToInteger = false,
        outputPath = defaultOutputPath,
        ignoreHiddenLayers = true,
        clearOldImages = false
    }
    -- Create a config directory under the user's Aseprite config path, and define the config file path
    local configDir = app.fs.joinPath(app.fs.filePath(app.fs.userConfigPath), "Cache")
    app.fs.makeDirectory(configDir)
    local configPath = app.fs.joinPath(configDir, "Prepare-For-Spine-Config.txt")
    local configFile = io.open(configPath, "r")
    if (configFile == nil) then
        return cached, configPath
    end

    local raw = {}
    for line in configFile:lines() do
        local key, value = string.match(line, "^([^=]+)=(.*)$")
        if (key ~= nil and value ~= nil) then
            raw[key] = value
        end
    end
    configFile:close()

    cached.originX = tonumber(raw.originX) or cached.originX
    cached.originY = tonumber(raw.originY) or cached.originY
    cached.imageScalePercent = clampValue(tonumber(raw.imageScalePercent) or cached.imageScalePercent, 0, IMAGE_SCALE_VALUE_MAX)
    cached.imagePaddingPx = clampValue(math.floor((tonumber(raw.imagePaddingPx) or cached.imagePaddingPx) + 0.5), 0, IMAGE_PADDING_INPUT_MAX)
    if (raw.originMode == ORIGIN_MODE.PIXEL or raw.originMode == ORIGIN_MODE.NORMALIZED) then
        cached.originMode = raw.originMode
    end
    cached.roundCoordinatesToInteger = parseBool(raw.roundCoordinatesToInteger, cached.roundCoordinatesToInteger)
    cached.ignoreHiddenLayers = parseBool(raw.ignoreHiddenLayers, cached.ignoreHiddenLayers)
    cached.clearOldImages = parseBool(raw.clearOldImages, cached.clearOldImages)
    if (raw.outputPath ~= nil and raw.outputPath ~= "") then
        cached.outputPath = raw.outputPath
    end

    return cached, configPath
end

--[[
Saves UI options to cache file.
configPath: The path to the config file to save
options: The options to save
]]
function saveCachedOptions(configPath, options)
    local configFile = io.open(configPath, "w")
    if (configFile == nil) then
        return
    end

    configFile:write("originX=" .. string.format("%.3f", options.originX) .. "\n")
    configFile:write("originY=" .. string.format("%.3f", options.originY) .. "\n")
    configFile:write("imageScalePercent=" .. string.format("%.3f", options.imageScalePercent or 100) .. "\n")
    configFile:write("imagePaddingPx=" .. string.format("%.0f", options.imagePaddingPx or 0) .. "\n")
    configFile:write("originMode=" .. (options.originMode or ORIGIN_MODE.NORMALIZED) .. "\n")
    configFile:write("roundCoordinatesToInteger=" .. tostring(options.roundCoordinatesToInteger == true) .. "\n")
    configFile:write("outputPath=" .. (options.outputPath or "") .. "\n")
    configFile:write("ignoreHiddenLayers=" .. tostring(options.ignoreHiddenLayers == true) .. "\n")
    configFile:write("clearOldImages=" .. tostring(options.clearOldImages == true) .. "\n")
    configFile:close()
end
--#endregion

--#region Other Functions

-- Draws a consistent pixel-grid Spine logo on the options dialog.
function DrawSpineLogo(optionsDialog)
    if (optionsDialog == nil) then
        return
    end

    -- Decode the embedded Spine logo (78x29, 4 colors, RLE-encoded).
    -- To regenerate after changing Images/Spine-Logo.png:
    --   1. Run tools/generate_logo_rle.lua in Aseprite (File > Scripts)
    --   2. Paste the contents of tools/logo_rle_output.txt below.
    local logoWidth = 78
    local logoHeight = 29
    local rleData = "40,70D,60,74D,30,76D,20,76D,0,34D,3R,74D,8R,70D,9R,43D,5W,6D,2W,D,5W,7D,9R,6D,2W,2D,4W,10D,5W,13D,7W,5D,9W,7D,7R,7D,2W,D,6W,8D,8W,10D,3W,3D,2W,5D,4W,2D,4W,9D,3R,8D,4W,3D,3W,6D,3W,4D,2W,10D,2W,11D,3W,4D,3W,20D,3W,5D,2W,6D,2W,6D,2W,9D,3W,10D,2W,6D,2W,7D,R,3D,R,8D,2W,6D,2W,5D,3W,6D,2W,10D,4W,8D,2W,6D,2W,6D,7R,7D,2W,6D,2W,5D,11W,11D,5W,6D,2W,6D,2W,6D,7R,7D,2W,6D,2W,5D,11W,13D,4W,5D,2W,6D,2W,7D,5R,8D,2W,6D,2W,5D,2W,24D,2W,5D,2W,6D,2W,9D,R,10D,2W,6D,2W,5D,2W,24D,2W,5D,3W,4D,3W,20D,2W,6D,2W,6D,2W,17D,2W,3D,3W,5D,4W,2D,3W,11D,3R,7D,2W,6D,2W,6D,3W,5D,2W,9D,7W,6D,2W,D,5W,10D,6R,6D,2W,6D,2W,7D,9W,10D,5W,7D,2W,2D,3W,12D,4R,7D,2W,6D,2W,9D,5W,24D,2W,18D,2R,56D,2W,76D,2W,76D,2W,18D,4R,75D,2R,37D,0,76D,20,76D,30,74D,60,70D,40"
    local colorMap = {
        ["0"] = app.pixelColor.rgba(0, 0, 0, 0),
        ["R"] = app.pixelColor.rgba(255, 64, 0, 255),
        ["W"] = app.pixelColor.rgba(240, 240, 241, 255),
        ["D"] = app.pixelColor.rgba(2, 18, 18, 255),
    }

    local buildOk, logoImage = pcall(function()
        local img = Image(logoWidth, logoHeight, ColorMode.RGB)
        local px = 0
        for token in string.gmatch(rleData, "[^,]+") do
            local count, ch = string.match(token, "^(%d+)(.)$")
            if (count == nil) then
                ch = token
                count = 1
            else
                count = tonumber(count)
            end
            local color = colorMap[ch]
            for _ = 1, count do
                local x = px % logoWidth
                local y = math.floor(px / logoWidth)
                img:drawPixel(x, y, color)
                px = px + 1
            end
        end
        return img
    end)

    if (not buildOk or logoImage == nil) then
        return
    end

    -- Build a 2x nearest-neighbor display image for clearer rendering in the dialog.
    local displayScale = 2
    local displayImage = logoImage
    local scaledOk, scaledOrError = pcall(function()
        local scaled = Image(logoWidth * displayScale, logoHeight * displayScale, ColorMode.RGB)
        for y = 0, logoHeight - 1 do
            for x = 0, logoWidth - 1 do
                local px = logoImage:getPixel(x, y)
                local sx = x * displayScale
                local sy = y * displayScale
                scaled:drawPixel(sx, sy, px)
                scaled:drawPixel(sx + 1, sy, px)
                scaled:drawPixel(sx, sy + 1, px)
                scaled:drawPixel(sx + 1, sy + 1, px)
            end
        end
        return scaled
    end)
    if (scaledOk == true and scaledOrError ~= nil) then
        displayImage = scaledOrError
    end

    local minCanvasWidth = 360
    local canvasWidth = math.max(displayImage.width, minCanvasWidth)
    local canvasHeight = displayImage.height
    local drawX = math.floor((canvasWidth - displayImage.width) * 0.5)
    local drawY = 0
    optionsDialog:canvas({
        id = "spineLogoCanvas",
        width = canvasWidth,
        height = canvasHeight,
        onpaint = function(ev)
            local gc = ev.context
            gc.antialias = false
            gc:drawImage(displayImage, drawX, drawY)
        end
    })

    optionsDialog:separator({})
end
--#endregion


-----------------------------------------------[[ Main Execution ]]-----------------------------------------------
local activeSprite = app.activeSprite
if (activeSprite == nil) then
    -- If user has no active sprite selected in the UI
    app.alert("Please click the sprite you'd like to export")
    return
elseif (activeSprite.filename == "") then
    -- If the user has created a sprite, but never saved it
    app.alert("Please save the current sprite before running this script")
    return
end

-- Show the export options dialog UI and get the user's selected options.
local options = showExportOptionsDialog()
if (options == nil) then
    return
end

local flattenedLayers = {} -- This will be the flattened view of the sprite layers, ignoring groups
local effectiveVisibilities = {} -- This will be the effective visibility of each layer (true / false)
flattenWithEffectiveVisibility(activeSprite, flattenedLayers, effectiveVisibilities, true, options.ignoreHiddenLayers)

if (containsDuplicates(flattenedLayers, effectiveVisibilities)) then
    return
end

-- Get an array containing each layer index and whether it is currently visible
local visibilities = captureVisibilityStates(flattenedLayers)

-- Calculate the normalized origin coordinates (range 0-1) based on the user's selected origin mode and input values
local normalizedOriginX, normalizedOriginY = getNormalizeOriginCoordinates(
    options.originMode,
    options.originX,
    options.originY
)
-- Saves each sprite layer as a separate .png under the 'images' subdirectory
captureLayers(
    flattenedLayers,
    activeSprite,
    effectiveVisibilities,
    options.outputPath,
    options.clearOldImages,
    normalizedOriginX,
    normalizedOriginY,
    options.roundCoordinatesToInteger,
    options.imageScalePercent,
    options.imagePaddingPx
)

-- Restore the layer's visibilities to how they were before
restoreVisibilities(flattenedLayers, visibilities)