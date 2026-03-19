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
        if (not layer.isGroup and visibilities[i] == true) then
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
        if (not layer.isGroup and effectiveVisibilities[i] == true) then
            -- Set the layer to visible so we can capture it, then set it back to hidden after
            layer.isVisible = true
            local cel = layer.cels[1]
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
            -- If roundCoordinatesToInteger is true, round the attachmentX and attachmentY to the nearest integer using math.modf.  Otherwise, keep the decimal values with 3 decimal places.
            if (roundCoordinatesToInteger == true) then
                attachmentX = math.modf(attachmentX)
                attachmentY = math.modf(attachmentY)
                skinsJson[index] = string.format([[ "%s": { "%s": { "x": %d, "y": %d, "width": 1, "height": 1 } } ]], name, name, attachmentX, attachmentY)
            else
                skinsJson[index] = string.format([[ "%s": { "%s": { "x": %.3f, "y": %.3f, "width": 1, "height": 1 } } ]], name, name, attachmentX, attachmentY)
            end
            index = index + 1
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

    if (app.fs.pathSeparator == "\\") then
        os.execute('rmdir /S /Q "' .. path .. '"')
    else
        os.execute('rm -rf "' .. path .. '"')
    end
end

--[[
Opens the OS file explorer and selects the exported file when possible.
filePath: The full path of the exported file
]]
function openFileLocation(filePath)
    if (filePath == nil or filePath == "") then
        return
    end

    if (app.fs.pathSeparator == "\\") then
        os.execute('explorer /select,"' .. filePath .. '"')
    else
        local dirPath = app.fs.filePath(filePath)
        if (app.fs.pathSeparator == "/") then
            os.execute('xdg-open "' .. dirPath .. '"')
        end
    end
end


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
    CURRENT_ORIGIN_MODE = cachedOptions.originMode

    --#region Other Buttons
    -- button: Resets all options to their default values
    optionsDialog:button({
        text = "Reset Config",
        onclick = function()
            setOriginMode(optionsDialog, ORIGIN_MODE.NORMALIZED)
            optionsDialog:modify({ id = "originX", text = string.format("%.3f", 0.5) })
            optionsDialog:modify({ id = "originY", text = string.format("%.3f", 0) })
            optionsDialog:modify({ id = "imageScalePercent", text = string.format("%.3f", 100) })
            optionsDialog:modify({ id = "imageScaleSlider", value = IMAGE_SCALE_SLIDER_MAX / 10 })
            optionsDialog:modify({ id = "imagePaddingPx", text = string.format("%.0f", 1) })
            optionsDialog:modify({ id = "imagePaddingSlider", value = 1 })
            optionsDialog:modify({ id = "roundCoordinatesToInteger", selected = false })
            optionsDialog:modify({ id = "outputPath", text = defaultOutputPath })
            optionsDialog:modify({ id = "ignoreHiddenLayers", selected = true })
            optionsDialog:modify({ id = "clearOldImages", selected = false })
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
    -- radio: Option to choose between normalized coordinates (0-1) or pixel-based coordinates
    optionsDialog:radio({
        id = "originModeNormalized",
        label = "Origin Mode",
        text = ORIGIN_MODE.NORMALIZED,
        selected = cachedOptions.originMode == ORIGIN_MODE.NORMALIZED,
        onclick = function()
            setOriginMode(optionsDialog, ORIGIN_MODE.NORMALIZED)
            applyOriginMode(optionsDialog)
        end
    })
    optionsDialog:radio({
        id = "originModePixel",
        text = ORIGIN_MODE.PIXEL,
        selected = cachedOptions.originMode == ORIGIN_MODE.PIXEL,
        onclick = function()
            setOriginMode(optionsDialog, ORIGIN_MODE.PIXEL)
            applyOriginMode(optionsDialog)
        end
    })
    setOriginMode(optionsDialog, cachedOptions.originMode)
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
            syncOriginSlidersToFields(optionsDialog, "x")
        end
    })
    :slider({
        id = "originYSlider",
        min = 0,
        max = ORIGIN_SLIDER_STEPS,
        value = 0,
        onchange = function()
            syncOriginSlidersToFields(optionsDialog, "y")
        end
    })
    applyOriginMode(optionsDialog)

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
        label = "Round Coordinates To Integer",
        text = "Drop decimal pixels, May misalign pixels; not recommended for pixel art.",
        selected = cachedOptions.roundCoordinatesToInteger
    })

    optionsDialog:separator({})
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

    --#region Other Settings
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
    
    --#region Output Path Settings
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

    -- Show the dialog and wait for user input.
    optionsDialog:show({ wait = true})

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
    -- Button to open the file location in the OS file explorer.
    completedDialog:button({
        text = "Open File Folder",
        onclick = function()
            openFileLocation(jsonFileName)
            completedDialog:close()
        end
    })
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

--#region Coordinates Settings Functions
ORIGIN_MODE = {
    NORMALIZED = "Normalized", -- Normalized origin coordinates in the range [0,1], where (0,0) is the bottom-left.
    PIXEL = "Pixel", -- Pixel-based origin coordinates, where (0,0) is the bottom-left of the sprite and values are in pixels.
}
CURRENT_ORIGIN_MODE = ORIGIN_MODE.NORMALIZED
ORIGIN_SLIDER_STEPS = 100
ORIGIN_SLIDER_IS_SYNCING = false

--[[
Sets the selected origin mode radio button in the options dialog based on the given mode.
optionsDialog: The export options dialog instance
mode: The origin mode to select (ORIGIN_MODE.PIXEL or ORIGIN_MODE.NORMALIZED)
]]
function setOriginMode(optionsDialog, mode)
    local currentMode = CURRENT_ORIGIN_MODE

    if (currentMode ~= mode) then
        convertOriginCoordinatesByMode(optionsDialog, mode)
        optionsDialog:modify({ id = "originModeNormalized", selected = mode == ORIGIN_MODE.NORMALIZED })
        optionsDialog:modify({ id = "originModePixel", selected = mode == ORIGIN_MODE.PIXEL })
        CURRENT_ORIGIN_MODE = mode
    else
        optionsDialog:modify({ id = "originModeNormalized", selected = mode == ORIGIN_MODE.NORMALIZED })
        optionsDialog:modify({ id = "originModePixel", selected = mode == ORIGIN_MODE.PIXEL })
    end
end

--[[
Gets the currently selected origin mode from the options dialog.
optionsDialog: The export options dialog instance
]]
function getOriginMode()
    return CURRENT_ORIGIN_MODE
end

--[[
Applies the selected origin mode to the originX and originY fields.
optionsDialog: The export options dialog instance
]]
function applyOriginMode(optionsDialog)
    local spriteWidth, spriteHeight = getActiveSpriteSize()
    local mode = getOriginMode()

    local currentX = tonumber(optionsDialog.data.originX)
    local currentY = tonumber(optionsDialog.data.originY)
    if (mode == ORIGIN_MODE.PIXEL) then
        if (currentX == nil) then
            currentX = spriteWidth * 0.5
        end
        if (currentY == nil) then
            currentY = 0
        end
    else
        if (currentX == nil) then
            currentX = 0.5
        end
        if (currentY == nil) then
            currentY = 0
        end
    end

    optionsDialog:modify({ id = "originX", text = tostring(currentX) })
    optionsDialog:modify({ id = "originY", text = tostring(currentY) })
    clampOriginXyFieldValue(optionsDialog)

    -- Update the coordinate settings label to show the valid input range for the selected origin mode
    if (mode == ORIGIN_MODE.PIXEL) then
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

    optionsDialog:modify({ id = "originX", text = tostring(convertedX) })
    optionsDialog:modify({ id = "originY", text = tostring(convertedY) })
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

    optionsDialog:modify({ id = "originX", text = string.format("%.3f", x) })
    optionsDialog:modify({ id = "originY", text = string.format("%.3f", y) })
    clampOriginXyFieldValue(optionsDialog)
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
function syncOriginSlidersToFields(optionsDialog, axis)
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
    if (axis == "x") then
        local x = fromOriginSliderValue(sliderX, maxX)
        optionsDialog:modify({ id = "originX", text = string.format("%.3f", x) })
    elseif (axis == "y") then
        local y = fromOriginSliderValue(sliderY, maxY)
        optionsDialog:modify({ id = "originY", text = string.format("%.3f", y) })
    end
    ORIGIN_SLIDER_IS_SYNCING = false

    clampOriginXyFieldValue(optionsDialog)
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
    local configPath = app.fs.joinPath(configDir, "Prepare-For-Spine-Config.json")
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