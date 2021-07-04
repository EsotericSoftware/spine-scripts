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
function captureLayers(layers, sprite, visibilityStates)
    hideAllLayers(layers)

    local outputDir = app.fs.filePath(sprite.filename)
    local spriteFileName = app.fs.fileTitle(sprite.filename)

    local jsonFileName = outputDir .. app.fs.pathSeparator .. spriteFileName .. ".json"
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
    
    local separator = app.fs.pathSeparator
    
    for i, layer in ipairs(layers) do
        -- Ignore groups and non-visible layers
        if (not layer.isGroup and visibilityStates[i] == true) then
            layer.isVisible = true
            local cel = layer.cels[1]
            local cropped = Sprite(sprite)
            cropped:crop(cel.position.x, cel.position.y, cel.bounds.width, cel.bounds.height)
            cropped:saveCopyAs(outputDir .. separator .. "images" .. separator .. layer.name .. ".png")
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

-- Saves each sprite layer as a separate .png under the 'images' subdirectory
-- and write out the json file for importing into spine.
captureLayers(flattenedLayers, activeSprite, visibilities)

-- Restore the layer's visibilities to how they were before
restoreVisibilities(flattenedLayers, visibilities)