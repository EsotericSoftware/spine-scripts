--[[

Aseprite to Spine Exporter Script
Written by Jordan Bleu

https://github.com/jordanbleu/aseprite-to-spine

]]

-----------------------------------------------[[ Functions ]]-----------------------------------------------
--[[
Returns a flattened view of
the layers and groups of the sprite.
parent: The sprite or parent layer group
arr: The array to append to
]]
function getLayers(parent, arr)
    for i, layer in ipairs(parent.layers) do
        if (layer.isGroup) then
            arr[#arr + 1] = layer
            arr = getLayers(layer, arr)
        else
            arr[#arr + 1] = layer
        end
    end
    return arr
end

--[[
Checks for duplicate layer names, and returns true if any exist (also shows an error to the user)
layers: The flattened view of the sprite layers
]]
function containsDuplicates(layers)
    for i, layer in ipairs(layers) do
        if (layer.isVisible) then
            for j, otherLayer in ipairs(layers) do
                -- if we find a duplicate in the list that is not our index
                if (j ~= i) and (otherLayer.name == layer.name) and (otherLayer.isVisible) then
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
outputDir: the directory the sprite is saved in
visibilityStates: the prior state of each layer's visibility (true / false)
]]
function captureLayers(layers, sprite, outputDir, visibilityStates)
    hideAllLayers(layers)
    
    local separator = app.fs.pathSeparator
    
    for i, layer in ipairs(layers) do
        -- Ignore groups and non-visible layers
        if (not layer.isGroup and visibilityStates[i] == true) then
            layer.isVisible = true
            sprite:saveCopyAs(outputDir .. separator .. "images" .. separator .. layer.name .. ".png")
            layer.isVisible = false
        end
    end
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

local flattenedLayers = getLayers(activeSprite, {})

if (containsDuplicates(flattenedLayers)) then
    return
end

-- Get an array containing each layer index and whether it is currently visible
local visibilities = captureVisibilityStates(flattenedLayers)

-- directory where the sprite is saved
local spritePath = app.fs.filePath(activeSprite.filename)

-- Saves each sprite layer as a separate .png under the 'images' subdirectory
captureLayers(flattenedLayers, activeSprite, spritePath, visibilities)

-- Restore the layer's visibilities to how they were before
restoreVisibilities(flattenedLayers, visibilities)

--[[
Write out the json file for importing into spine.
(sorry this is so ugly, I didn't want to include a full lua json library)
]]
local spriteFilename = app.fs.fileName(activeSprite.filename)
local jsonFileName = spritePath .. "/" .. spriteFilename .. ".json"
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

for i, layer in ipairs(flattenedLayers) do
    
    if not layer.isGroup then
        local name = layer.name
        slotsJson[index] = string.format([[ { "name": "%s", "bone": "%s", "attachment": "%s" } ]], name, "root", name)
        skinsJson[index] = string.format([[ "%s": { "%s": { "x": 0, "y": 0, "width": 1, "height": 1 } } ]], name, name)
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