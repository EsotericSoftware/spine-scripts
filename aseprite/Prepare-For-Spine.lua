--[[
Aseprite to Spine Exporter Script
Written by Jordan Bleu
https://github.com/jordanbleu/aseprite-to-spine
]]

-----------------------------------------------[[ Functions ]]-----------------------------------------------
--[[
Flattens the layers of a sprite while allowing optional ignore of parent group visibility.
parent: The sprite or parent layer group
outLayers: The array to append the flattened layers
outVis: The array to append the effective visibility of each layer (true / false)
inheritedVisible: The visibility inherited from parent groups (true / false)
ignoreGroupVisibility: If true, visibility only depends on the layer's own isVisible value
]]
function flattenWithEffectiveVisibility(parent, outLayers, outVis, inheritedVisible, ignoreGroupVisibility)
    for _, layer in ipairs(parent.layers) do
        -- Determine the effective visibility of the layer based on its own visibility and the inherited visibility from parent groups
        local effectiveVisible
        if (ignoreGroupVisibility) then
            effectiveVisible = layer.isVisible
        else
            effectiveVisible = inheritedVisible and layer.isVisible
        end
        
        -- Append the layer and its effective visibility to the output arrays
        outLayers[#outLayers + 1] = layer
        outVis[#outVis + 1] = effectiveVisible
        
        -- If this layer is a group, recursively flatten its children, passing down the effective visibilityStates
        if layer.isGroup then
            local nextInherited = ignoreGroupVisibility and true or effectiveVisible
            flattenWithEffectiveVisibility(layer, outLayers, outVis, nextInherited, ignoreGroupVisibility)
        end
    end
end

--[[
Checks for duplicate layer names, and returns true if any exist (also shows an error to the user)
layers: The flattened view of the sprite layers
]]
function containsDuplicates(layers, visibilities)
    for i, layer in ipairs(layers) do
        if (not layer.isGroup and visibilities[i] == true) then
            for j, otherLayer in ipairs(layers) do
                -- if we find a duplicate in the list that is not our index
                if (j ~= i) and (not otherLayer.isGroup) and (otherLayer.name == layer.name) and (visibilities[j] == true) then
                    app.alert("Found multiple visible layers named '" .. layer.name .. "'.  Please use unique layer names or hide one of these layers.")
                    return true
                end
            end
        end
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
]]
function captureLayers(layers, sprite, effectiveVisibilities, outputPath, clearOldImages, originX, originY, roundCoordinatesToInteger)
    -- Default output path to the sprite-name json in the sprite's directory.
    if (outputPath == nil or outputPath == "") then
        local defaultOutputDir = app.fs.filePath(sprite.filename)
        local defaultSpriteName = app.fs.fileTitle(sprite.filename)
        outputPath = defaultOutputDir .. app.fs.pathSeparator .. defaultSpriteName .. ".json"
    end

    local outputDir = app.fs.filePath(outputPath)

    -- Create the output directory if it doesn't exist
    local separator = app.fs.pathSeparator
    local imagesDir = outputDir .. separator .. "images"
    -- If the user chose to clear old images, delete the existing images directory and its contents before creating a new one
    if (clearOldImages == true) then
        deleteDirectoryRecursive(imagesDir)
    end
    app.fs.makeDirectory(imagesDir)

    -- First hide all layers so we can selectively show them when we capture them
    hideAllLayers(layers)

    local jsonFileName = outputPath
    json = io.open(jsonFileName, "w")
    json:write('{')
    -- skeleton
    json:write([[ "skeleton": { "images": "images/" }, ]])
    -- bones
    json:write([[ "bones": [ { "name": "root" }	], ]])

    -- build arrays of json properties for skins and slots
    -- we only include layers, not groups
    local slotsJson = {}
    local skinsJson = {}
    local index = 1
    
    for i, layer in ipairs(layers) do
        -- Ignore groups and non-visible layers
        if (not layer.isGroup and effectiveVisibilities[i] == true) then
            -- Set the layer to visible so we can capture it, then set it back to hidden after
            layer.isVisible = true
            local cel = layer.cels[1]
            local cropped = Sprite(sprite)
            cropped:crop(cel.position.x, cel.position.y, cel.bounds.width, cel.bounds.height)
            cropped:saveCopyAs(imagesDir .. separator .. layer.name .. ".png")
            cropped:close()
            layer.isVisible = false
            local name = layer.name
            -- Calculate the attachment position based on the cel position, cel bounds, sprite bounds, and the user-defined originX and originY.
            local attachmentX = cel.bounds.width / 2 + cel.position.x - sprite.bounds.width * originX
            local attachmentY = sprite.bounds.height * (1 - originY) - cel.position.y - cel.bounds.height / 2
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

    -- Show export completion dialog
    showExportCompletedDialog(jsonFileName)
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


-----------------------------------------------[[ UI ]]-----------------------------------------------
--[[
Shows the export options dialog and returns the selected options.
defaultOutputPath: The default json output path
]]
function showExportOptionsDialog(defaultOutputPath)
    -- Create a dialog to show export optionsDialog
    local optionsDialog = Dialog({ title = "Export To Spine" })

    -- label: Coordinate settings section
    optionsDialog:label({
        id = "coordinateSettings",
        label = "Coordinate Settings",
        text = "Set which position is used as the Spine origin (0,0). Range: [0,1]."
    })
    -- number: Coordinate origin X and Y (0-1).
    optionsDialog:number({
        id = "originX",
        label = "Origin (X,Y)",
        text = "0.5",
        decimals = 3,
    })
    :number({
        id = "originY",
        text = "0",
        decimals = 3,
    })
    -- check: Option to round attachment coordinates to integers instead of keeping decimals
    optionsDialog:check({
        id = "roundCoordinatesToInteger",
        label = "Round Coordinates To Integer",
        text = "Drop decimal pixels, May misalign pixels; not recommended for pixel art.",
        selected = false
    })
    optionsDialog:separator({})
    
    -- entry: Output json path
    optionsDialog:entry({
        id = "outputPath",
        label = "Output Path",
        text = defaultOutputPath
    })
    -- file: File picker to select output json path (syncs with entry)
    optionsDialog:file({
        id = "outputPathPicker",
        title = "Select Output Path",
        filename = defaultOutputPath,
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

    -- check: Option to ignore group visibility when determining layer visibilityStates
    optionsDialog:check({
        id = "ignoreGroupVisibility",
        label = "Ignore Group Visibility",
        text = "Use layer visibility only.",
        selected = false
    })

    -- check: Option to clear old images in the output images directory before export
    optionsDialog:check({
        id = "clearOldImages",
        label = "Clear Old Images",
        text = "Delete existing images first.",
        selected = false
    })
    optionsDialog:separator({})

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

    -- Show the dialog with width 500 and centered position.
    local dialogWidth = 500
    local dialogHeight = 190
    local x = (app.window.width - dialogWidth) / 2
    local y = (app.window.height - dialogHeight) / 2
    optionsDialog:show({ wait = true, bounds = Rectangle(x, y, dialogWidth, dialogHeight) })
    if (not confirmed) then
        return nil
    end

    -- Get the selected options from the dialog
    local options = optionsDialog.data
    -- Fallback to default path when input is empty.
    if (options.outputPath == nil or options.outputPath == "") then
        options.outputPath = defaultOutputPath
    end
    
    -- Parse originX and originY as numbers, and fallback to defaults if parsing fails or values are out of range
    local parsedOriginX = tonumber(options.originX)
    local parsedOriginY = tonumber(options.originY)
    options.originX = (parsedOriginX ~= nil and parsedOriginX >= 0 and parsedOriginX <= 1) and parsedOriginX or 0.5
    options.originY = (parsedOriginY ~= nil and parsedOriginY >= 0 and parsedOriginY <= 1) and parsedOriginY or 0

    return options
end

--[[
Shows export completion dialog with action to open the exported file location.
jsonFileName: The exported json file path
]]
function showExportCompletedDialog(jsonFileName)
    local completedDialog = Dialog({ title = "Export Completed" })

    completedDialog:label({
        id = "message",
        text = "Export completed! Use this file for importing into Spine:\n" .. jsonFileName
    })

    completedDialog:newrow()
    completedDialog:button({
        text = "Open File Folder",
        onclick = function()
            openFileLocation(jsonFileName)
            completedDialog:close()
        end
    })

    completedDialog:button({
        text = "OK",
        focus = true,
        onclick = function()
            completedDialog:close()
        end
    })

    completedDialog:show({ wait = true })
end


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
local spriteOutputDir = app.fs.filePath(activeSprite.filename)
local spriteOutputName = app.fs.fileTitle(activeSprite.filename)
local defaultOutputPath = spriteOutputDir .. app.fs.pathSeparator .. spriteOutputName .. ".json"
local options = showExportOptionsDialog(defaultOutputPath)
if (options == nil) then
    return
end

local flattenedLayers = {} -- This will be the flattened view of the sprite layers, ignoring groups
local effectiveVisibilities = {} -- This will be the effective visibility of each layer (true / false)
flattenWithEffectiveVisibility(activeSprite, flattenedLayers, effectiveVisibilities, true, options.ignoreGroupVisibility)

if (containsDuplicates(flattenedLayers, effectiveVisibilities)) then
    return
end

-- Get an array containing each layer index and whether it is currently visible
local visibilities = captureVisibilityStates(flattenedLayers)

-- Saves each sprite layer as a separate .png under the 'images' subdirectory
captureLayers(
    flattenedLayers, 
    activeSprite, 
    effectiveVisibilities, 
    options.outputPath, 
    options.clearOldImages, 
    options.originX, 
    options.originY,
    options.roundCoordinatesToInteger
)

-- Restore the layer's visibilities to how they were before
restoreVisibilities(flattenedLayers, visibilities)