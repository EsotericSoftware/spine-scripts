# After Effects to Spine

## ae_to_spine.jsx

To download, right click [ae_to_spine.jsx](https://github.com/EsotericSoftware/spine-scripts/raw/master/aftereffects/ae_to_spine.jsx) and choose `Save As`.

The ae_to_spine.jsx script exports a lot of animation data from After Effects, but not everything. The following are supported:

* Image layers
* PNG sequence layers
* Layer hierarchy (parenting)
* Translation (position), rotation, scale, opacity keyframes (as linear)
* Composition layers (nested compositions)
* Per-layer in-point and out-point (visibility)
* Time remapping
* Additive blend mode
* Export multiple compositions as a single skeleton with multiple animations

The following are not supported:

* Animating anchor points
* 3D transformations
* Warp effects, puppet animation, etc (no deformation)
* Glows, shadows, etc (no effects)
* Masks of any kind
* Color transformations of any kind
* Plugin effects, like particles, etc

Some of these limitations are easier to work around than others:

* If you are warping an image, consider rendering out the warping animation to a PNG sequence and using that as a layer.
* For particle effects, render those out as a separate PNG sequence as well. Use a lower resolution if you can to save texture space.
* Same goes for glows, shadows, and other effects. They can be rendered out, added as another layer, and faded in and out using opacity, often at lower resolution.

If running the script from the ExtendScript Toolkit, ensure `Do Not Break on Guarded Exceptions` is checked under the `Debug` menu.

## psd_to_spine.jsx

To download, right click [psd_to_spine.jsx](https://github.com/EsotericSoftware/spine-scripts/raw/master/aftereffects/psd_to_spine.jsx) and choose `Save As`.

This script differs from the [PhotoshopToSpine script](https://github.com/EsotericSoftware/spine-scripts/blob/master/photoshop/PhotoshopToSpine.jsx) to work with the new Photoshop CC [image generator](http://blogs.adobe.com/photoshopdotcom/2013/09/introducing-adobe-generator-for-photoshop-cc.html) feature.

psd_to_spine.jsx only exports layers that have ".png" in their name. Also, a scale can be specified in the layer name. For example, "25% foo.png" will write a PNG that is 25% of the layer size and will add `"scaleX": 4.0, "scaleY": 4.0` to the Spine JSON output.

psd_to_spine.jsx also exports groups as bones and uses relative positions for the layers within the group/bone.

The following layer attributes are exported:

* x, y, width, height
* scale (as declared in the layer name)
* opacity
* additive blend mode

Some notable things that aren't supported:

* rotation (even for smart objects, this just isn't something that is accessible through scripting)
* blend modes other than "additive"
* eliminating duplicate images (can be done using Spine's [texture packer](http://esotericsoftware.com/spine-texture-packer))

## spine_migration.py

To download, right click [spine_migration.py](https://github.com/EsotericSoftware/spine-scripts/raw/master/aftereffects/spine_migration.py) and choose `Save As`.

Starting from Spine version 2.0.00, the way scale timeline values are computed has changed. This python script updates any spine JSON file below version 2.0.00 and recreates the scale timelines. It does not preserve the pretty formatting that Spine outputs. The script can be run multiple times without ill effect.

Scale timeline keys that would scale a bone to zero will use 0.001 instead. If a bone has zero scale in the setup pose, scale timeline keys cannot affect it.
