--[[
Generates RLE-encoded pixel data from the Spine logo PNG for embedding
in Prepare-For-Spine.lua.

How to use:
  1. Open Aseprite
  2. Run this script (File > Scripts > generate_logo_rle)
  3. The RLE string is saved to a text file next to this script
  4. Copy the output into DrawSpineLogo() in Prepare-For-Spine.lua

The logo PNG is expected at ../Images/Spine-Logo.png relative to this script.
]]

-- Resolve path to the logo image
local scriptDir = app.fs.filePath(debug.getinfo(1, "S").source:sub(2))
local logoPath = app.fs.joinPath(scriptDir, app.fs.joinPath("..", app.fs.joinPath("Images", "Spine-Logo.png")))
local outputPath = app.fs.joinPath(scriptDir, "logo_rle_output.txt")

-- Known color palette: RGBA -> single character
local colorChars = {
    ["0,0,0,0"] = "0",
    ["255,64,0,255"] = "R",
    ["240,240,241,255"] = "W",
    ["2,18,18,255"] = "D",
}

-- Load the logo as a sprite
local logoSprite = Sprite({ fromFile = logoPath })
if (logoSprite == nil) then
    app.alert("Error: Could not load " .. logoPath)
    return
end

local img = logoSprite.cels[1].image
local w = img.width
local h = img.height

-- Read pixels and map to characters
local chars = {}
local unknown = {}
for y = 0, h - 1 do
    for x = 0, w - 1 do
        local px = img:getPixel(x, y)
        local r = app.pixelColor.rgbaR(px)
        local g = app.pixelColor.rgbaG(px)
        local b = app.pixelColor.rgbaB(px)
        local a = app.pixelColor.rgbaA(px)
        local key = r .. "," .. g .. "," .. b .. "," .. a
        local ch = colorChars[key]
        if (ch == nil) then
            unknown[key] = true
            ch = "?"
        end
        chars[#chars + 1] = ch
    end
end

-- Close the sprite we opened (don't leave it in the editor)
logoSprite:close()

-- Check for unknown colors
local unknownList = {}
for key, _ in pairs(unknown) do
    unknownList[#unknownList + 1] = key
end
if (#unknownList > 0) then
    local msg = "Error: Image contains unsupported colors:\n"
    for _, c in ipairs(unknownList) do
        msg = msg .. "  RGBA(" .. c .. ")\n"
    end
    msg = msg .. "\nUpdate colorChars in this script and colorMap in the Lua script."
    app.alert(msg)
    return
end

-- RLE encode
local rleTokens = {}
local i = 1
while i <= #chars do
    local c = chars[i]
    local count = 1
    while i + count <= #chars and chars[i + count] == c do
        count = count + 1
    end
    if (count == 1) then
        rleTokens[#rleTokens + 1] = c
    else
        rleTokens[#rleTokens + 1] = tostring(count) .. c
    end
    i = i + count
end

local rleString = table.concat(rleTokens, ",")

-- Build output text
local output = string.format(
    '    local logoWidth = %d\n    local logoHeight = %d\n    local rleData = "%s"',
    w, h, rleString
)

-- Write to file
local f = io.open(outputPath, "w")
if (f == nil) then
    app.alert("Error: Could not write to " .. outputPath)
    return
end
f:write("-- Paste the following into DrawSpineLogo() in Prepare-For-Spine.lua\n\n")
f:write(output .. "\n")
f:close()

app.alert("Done! RLE output saved to:\n" .. outputPath .. "\n\nSize: " .. w .. "x" .. h .. " (" .. #chars .. " pixels)\nRLE length: " .. #rleString .. " chars")
