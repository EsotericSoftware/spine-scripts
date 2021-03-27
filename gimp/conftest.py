import sys
from copy import deepcopy


class gimp_Layer():

    def __init__(self, name, parent=None) -> None:
        self.name = name
        self.parent = parent

    name = ""
    visible = True
    offsets = (0, 0)
    width = 1920
    height = 1080
    image = None
    parent = None


class gimp_GroupLayer(gimp_Layer):

    def __init__(self, name, parent=None, image=None) -> None:
        self.name = name
        self.parent = parent
        self.image = image


def register(a, b, c, d, e, f, g, h, i, j, k):
    return a + b


def gimpfu_main():
    return None


class Dummy():
    name = ""
    layers = ["a"]

    def add_layer(a, b, c):
        pass

    def resize_to_layers(a):
        pass


class gimp_pdb():
    def gimp_image_new(a, b, c):
        return Dummy()

    def gimp_layer_new_from_drawable(a, b):
        return Dummy()

    def file_png_save(a, b, c, d, f, g, h, i, j, k, l):
        pass

    def gimp_layer_copy(a, b):
        return deepcopy(a)

    def gimp_image_insert_layer(a, b, c, d):
        assert(a is not None)
        assert(d == 0)
        a.append(b)

    def gimp_image_merge_layer_group(a, b):
        layer = gimp_Layer(b.name)
        a.layers[a.layers.index(b)] = layer
        return layer


gimpfu = type(sys)('gimpfu')
gimpfu.register = register
gimpfu.main = gimpfu_main
gimpfu.PF_ADJUSTMENT = None
gimpfu.PF_DIRNAME = None
gimpfu.PF_TOGGLE = None
sys.modules['gimpfu'] = gimpfu


gimp = type(sys)('gimp')
gimp.pdb = gimp_pdb
gimp.Layer = gimp_Layer
gimp.GroupLayer = gimp_GroupLayer
sys.modules['gimp'] = gimp
