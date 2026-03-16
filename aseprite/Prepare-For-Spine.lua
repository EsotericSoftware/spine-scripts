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
outputPath: the output json file path
effectiveVisibilities: the prior state of each layer's effectiveVisible visibility (true / false)
]]
function captureLayers(layers, sprite, effectiveVisibilities, outputPath)
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
            slotsJson[index] = string.format([[ { "name": "%s", "bone": "%s", "attachment": "%s" } ]], name, "root", name)
            skinsJson[index] = string.format([[ "%s": { "%s": { "x": %d, "y": %d, "width": 1, "height": 1 } } ]], name, name, cel.bounds.width/2 + cel.position.x - sprite.bounds.width/2, sprite.bounds.height - cel.position.y - cel.bounds.height/2)
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

    app.alert("Export completed!  Use file '" .. jsonFileName .. "' for importing into Spine.")
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


-----------------------------------------------[[ UI ]]-----------------------------------------------
--[[
Shows the export options dialog and returns the selected options.
defaultOutputPath: The default json output path
]]
function showExportOptionsDialog(defaultOutputPath)
    -- Create a dialog to show export optionsDialog
    local optionsDialog = Dialog({ title = "Export To Spine" })

    -- check: Option to ignore group visibility when determining layer visibilityStates
    optionsDialog:check({
        id = "ignoreGroupVisibility",
        label = "Ignore Group Visibility",
        tooltip = "If checked, layer visibility will only depend on the layer's own visibility setting, and not the visibility of any parent groups.",
        selected = false
    })

    -- entry: Output json file path
    optionsDialog:entry({
        id = "outputPath",
        label = "Output Path",
        text = defaultOutputPath
    })
    -- button: Open file picker to select output path
    optionsDialog:button({
        text = "Select Output Path",
        onclick = function()
            local currentPath = optionsDialog.data.outputPath
            if (currentPath == nil or currentPath == "") then
                currentPath = defaultOutputPath
            end

            local selectedPath = chooseOutputPath(currentPath)
            if (selectedPath ~= nil and selectedPath ~= "") then
                optionsDialog:modify({ id = "outputPath", text = selectedPath })

                -- Nested dialogs can leave stale paint artifacts in some builds; force a redraw.
                pcall(function()
                    app.refresh()
                end)
            end
        end
    })
    optionsDialog:newrow()

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

    -- Show the dialog with an initial width of 800px.
    optionsDialog:show({ wait = true, bounds = Rectangle(0, 0, 800, 220) })
    if (not confirmed) then
        return nil
    end

    -- Get the selected options from the dialog
    local options = optionsDialog.data
    -- Fallback to default path when input is empty.
    if (options.outputPath == nil or options.outputPath == "") then
        options.outputPath = defaultOutputPath
    end

    return options
end

--[[
Shows a file picker dialog to choose the output json path.
initialPath: The initial json path to show in the file picker
]]
function chooseOutputPath(initialPath)
    -- Default the filename to the same name as the sprite file, but with a .json extension
    local spriteFileName = "export"
    if (app.activeSprite ~= nil and app.activeSprite.filename ~= "") then
        spriteFileName = app.fs.fileTitle(app.activeSprite.filename)
    end
    local defaultPath = initialPath
    if (defaultPath == nil or defaultPath == "") then
        local defaultOutputDir = app.fs.filePath(app.activeSprite.filename)
        defaultPath = defaultOutputDir .. app.fs.pathSeparator .. spriteFileName .. ".json"
    end

    -- Create a file picker dialog to select the output directory and filename
    local picker = Dialog("Select Output Path")
    picker:file({
        id = "path",
        label = "Path",
        filename = defaultPath,
        save = true
    })

    -- button: Confirm selection
    picker:button({ id = "confirm", text = "Confirm" })
    -- button: Cancel selection
    picker:button({ id = "cancel", text = "Cancel" })
    picker:show({ wait = true })

    -- If the user confirmed and provided a path, return it. Otherwise return nil.
    local data = picker.data
    if (data.confirm and data.path ~= nil and data.path ~= "") then
        return data.path
    end

    return nil
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
captureLayers(flattenedLayers, activeSprite, effectiveVisibilities, options.outputPath)

-- Restore the layer's visibilities to how they were before
restoreVisibilities(flattenedLayers, visibilities)