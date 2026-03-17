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
]]
function captureLayers(
    layers, 
    sprite, 
    effectiveVisibilities, 
    outputPath, 
    clearOldImages, 
    originX, 
    originY, 
    roundCoordinatesToInteger)
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
                cropped:crop(cel.position.x, cel.position.y, cel.bounds.width, cel.bounds.height)
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
    local optionsDialog = Dialog({ title = "Export To Spine" })

    -- Load cached options or use defaults if no cache exists
    local activeSprite = app.activeSprite
    local spriteOutputDir = app.fs.filePath(activeSprite.filename)
    local spriteOutputName = app.fs.fileTitle(activeSprite.filename)
    local defaultOutputPath = spriteOutputDir .. app.fs.pathSeparator .. spriteOutputName .. ".json"
    local cachedOptions, configPath = loadCachedOptions(defaultOutputPath)

    --#region Other Buttons
    -- button: Resets all options to their default values
    optionsDialog:button({
        text = "Reset Config",
        onclick = function()
            optionsDialog:modify({ id = "originX", text = string.format("%.3f", 0.5) })
            optionsDialog:modify({ id = "originY", text = string.format("%.3f", 0) })
            optionsDialog:modify({ id = "roundCoordinatesToInteger", selected = false })
            optionsDialog:modify({ id = "outputPath", text = defaultOutputPath })
            optionsDialog:modify({ id = "ignoreGroupVisibility", selected = false })
            optionsDialog:modify({ id = "clearOldImages", selected = false })
        end
    })

    optionsDialog:separator({})
    --#endregion

    --#region Coordinate Settings

    -- function: Clamps a number to the range [0,1].
    local function clampTo01(value)
        if (value < 0) then
            return 0
        elseif (value > 1) then
            return 1
        end
        return value
    end
    -- function: Clamps the input field for originX and originY to the range [0,1].
    local function clampOriginField(fieldId, fallback)
        local parsed = tonumber(optionsDialog.data[fieldId])
        if (parsed == nil) then
            parsed = fallback
        end
        optionsDialog:modify({ id = fieldId, text = string.format("%.3f", clampTo01(parsed)) })
    end

    optionsDialog:label({
        id = "coordinateSettings",
        label = "Coordinate Settings",
        text = "Set which position is used as the Spine origin (0,0). Range: [0,1]."
    })
    -- number: Coordinate origin X and Y (0-1).
    optionsDialog:number({
        id = "originX",
        label = "Origin (X,Y)",
        text = string.format("%.3f", cachedOptions.originX),
        decimals = 3,
        onchange = function()
            clampOriginField("originX", 0.5)
        end
    })
    :number({
        id = "originY",
        text = string.format("%.3f", cachedOptions.originY),
        decimals = 3,
        onchange = function()
            clampOriginField("originY", 0)
        end
    })
    
    -- button: Presets for common origin settings (center, bottom-center, bottom-left, top-left)
    local function setOriginPreset(x, y)
        optionsDialog:modify({ id = "originX", text = string.format("%.3f", x) })
        optionsDialog:modify({ id = "originY", text = string.format("%.3f", y) })
    end
    optionsDialog:newrow()
    optionsDialog:button({
        text = "Center",
        onclick = function()
            setOriginPreset(0.5, 0.5)
        end
    })
    optionsDialog:button({
        text = "Bottom-Center",
        onclick = function()
            setOriginPreset(0.5, 0)
        end
    })
    optionsDialog:button({
        text = "Bottom-Left",
        onclick = function()
            setOriginPreset(0, 0)
        end
    })
    optionsDialog:button({
        text = "Top-Left",
        onclick = function()
            setOriginPreset(0, 1)
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

    --#region Other Settings
    -- check: Option to ignore group visibility when determining layer visibilityStates
    optionsDialog:check({
        id = "ignoreGroupVisibility",
        label = "Ignore Group Visibility",
        text = "Use layer visibility only.",
        selected = cachedOptions.ignoreGroupVisibility
    })

    -- check: Option to clear old images in the output images directory before export
    optionsDialog:check({
        id = "clearOldImages",
        label = "Clear Old Images",
        text = "Delete existing images first.",
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

    -- Show the dialog and wait for user input.
    optionsDialog:show({ wait = true})

    --#region options Data Extraction
    -- Get the selected options from the dialog
    local options = optionsDialog.data
    -- Fallback to default path when input is empty.
    if (options.outputPath == nil or options.outputPath == "") then
        options.outputPath = defaultOutputPath
    end
    -- Parse originX and originY as numbers, and fallback to defaults if parsing fails or values are out of range
    local parsedOriginX = tonumber(options.originX)
    local parsedOriginY = tonumber(options.originY)
    options.originX = clampTo01(parsedOriginX or 0.5)
    options.originY = clampTo01(parsedOriginY or 0)

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
jsonFileName: The exported json file path
failedPaths: The list of file/directory paths that failed to write
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
        -- List each failed path
        for _, path in ipairs(failedPaths) do
            completedDialog:newrow()
            completedDialog:label({
                text = path
            })
        end
    end

    completedDialog:newrow()
    -- Button to open the file location in the OS file explorer
    completedDialog:button({
        text = "Open File Folder",
        onclick = function()
            openFileLocation(jsonFileName)
            completedDialog:close()
        end
    })
    -- Button to close the dialog
    completedDialog:button({
        text = "OK",
        focus = true,
        onclick = function()
            completedDialog:close()
        end
    })

    completedDialog:show({ wait = true })
end

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
        roundCoordinatesToInteger = false,
        outputPath = defaultOutputPath,
        ignoreGroupVisibility = false,
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
    cached.roundCoordinatesToInteger = parseBool(raw.roundCoordinatesToInteger, cached.roundCoordinatesToInteger)
    cached.ignoreGroupVisibility = parseBool(raw.ignoreGroupVisibility, cached.ignoreGroupVisibility)
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
    configFile:write("roundCoordinatesToInteger=" .. tostring(options.roundCoordinatesToInteger == true) .. "\n")
    configFile:write("outputPath=" .. (options.outputPath or "") .. "\n")
    configFile:write("ignoreGroupVisibility=" .. tostring(options.ignoreGroupVisibility == true) .. "\n")
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