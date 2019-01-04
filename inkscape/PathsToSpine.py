#!/usr/bin/env python

'''
This script exports SVG paths from Inkscape to a JSON file
which can be imported into Esoteric Software's Spine.
http://esotericsoftware.com

Copyright (c) 2019 Pavel Astapov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
'''

import os, inkex, simplestyle, simpletransform, simplepath, cubicsuperpath, json
from string import rstrip
from math import sqrt

data = {
#	"skeleton": {},
	"bones": [{"name": "root"}],
	"slots": [],
	"skins": {"default": {}}
}

class path2spine(inkex.Effect):
	def __init__(self):
		inkex.Effect.__init__(self)
		self.OptionParser.add_option("-f", "--filename", action = "store", type = "string", dest = "filename", default = "~/paths.json", help = "File to export")
		self.OptionParser.add_option("-o", "--own_slot", action = "store", type = "inkbool", dest = "own_slot", default = True, help = "Export each path in its own slot")
		self.OptionParser.add_option("-s", "--selected_only", action = "store", type = "inkbool", dest = "selected_only", default = True, help = "Export only selected paths")
		self.OptionParser.add_option("-c", "--corner_type", action = "store", type = "string", dest = "corner_type", default = "curve", help = "Corner type for open paths")

	def effect(self):
		self.filename = self.options.filename
		self.own_slot = self.options.own_slot
		self.selected_only = self.options.selected_only
		self.corner_type = self.options.corner_type
		self.hw = self.unittouu(self.getDocumentWidth()) / 2
		self.hh = self.unittouu(self.getDocumentHeight()) / 2

		if not self.own_slot:
			data["slots"].append({"name": "paths", "bone": "root"})
			data["skins"]["default"]["paths"] = {}

		self._main_function()

	# Save JSON
	def save(self, filename):
		with open(os.path.expanduser(filename), "w") as f:
			json.dump(data, f, separators = (",", ": "), indent = 4)

	# Add path to JSON
	def path2json(self, name, closed, color, vertices):
		subdata = {}
		subdata["type"] = "path"
		if color:
			subdata["color"] = color
		subdata["closed"] = closed
		subdata["lengths"] = []
		subdata["vertices"] = []
		subdata["vertexCount"] = len(vertices) / 2
		subdata["vertices"] = vertices

		if self.own_slot:
			data["slots"].append({"name": name, "bone": "root", "attachment": name})
			data["skins"]["default"][name] = {name: subdata}
		else:
			data["skins"]["default"]["paths"][name] = subdata

	def get_color(self, node):
		style = simplestyle.parseStyle(node.get("style"))
		color = None
		if style.has_key("stroke"):
			if simplestyle.isColor(style["stroke"]):
				color = "%02x%02x%02x" % (simplestyle.parseColor(style["stroke"]))
				if style.has_key("stroke-opacity"):
					alpha = float(style["stroke-opacity"])
					if alpha < 1:
						color = color + "%02x" % int(alpha * 255)

		return color

	def is_line(self, p1, p2):
		return p1[1][0] == p1[2][0] and p1[1][1] == p1[2][1] and p2[0][0] == p2[1][0] and p2[0][1] == p2[1][1]

	def distance(self, x1, y1, x2, y2):
		return sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)

	def point_at_distance(self, n, x1, y1, x2, y2):
		d = self.distance(x1, y1, x2, y2)
		if d != 0:
			r = n / d
			return r * x2 + (1 - r) * x1, r * y2 + (1 - r) * y1
		else:
			return 0, 0

	def ccw(self, p1, p2, p3):
		if (p2[1] - p1[1]) * (p3[0] - p2[0]) - (p3[1] - p2[1]) * (p2[0] - p1[0]) < 0:
			return True
		else:
			return False

	# Convert closed path's line segments to curves
	def closed2curves(self, csp):
		x, y = 0, 0
		for i in range(len(csp[0]) - 1):
			if self.is_line(csp[0][i], csp[0][i + 1]):
				x1 = csp[0][i][1][0]
				y1 = csp[0][i][1][1]
				x2 = csp[0][i + 1][1][0]
				y2 = csp[0][i + 1][1][1]
				d = self.distance(x1, y1, x2, y2) / 3
				if d > 0:
					x, y = self.point_at_distance(d, x1, y1, x2, y2)
					csp[0][i][2][0] = x
					csp[0][i][2][1] = y
					x, y = self.point_at_distance(d, x2, y2, x1, y1)
					csp[0][i + 1][0][0] = x
					csp[0][i + 1][0][1] = y
			else:
				x, y = None, None

		if x and y:
			csp[0][0][0][0] = x
			csp[0][0][0][1] = y

	# Convert opened path's line segments to curves (closed2curves + offsetting corner points)
	def opened2curves(self, csp):
		self.closed2curves(csp)

		if self.corner_type == "line":
			x1 = csp[0][0][1][0]
			y1 = csp[0][0][1][1]
			x2 = csp[0][-1][1][0]
			y2 = csp[0][-1][1][1]
			d = self.distance(x1, y1, x2, y2) / 3
			if d > 0:
				x, y = self.point_at_distance(d, x1, y1, x2, y2)
				csp[0][0][0] = [x, y]
				x, y = self.point_at_distance(d, x2, y2, x1, y1)
				csp[0][-1][-1] = [x, y]
		else:
			x1 = csp[0][0][1][0]
			y1 = csp[0][0][1][1]
			x2 = csp[0][0][2][0]
			y2 = csp[0][0][2][1]
			d = self.distance(x1, y1, x2, y2)
			if d > 0:
				x, y = self.point_at_distance(-d, x1, y1, x2, y2)
				csp[0][0][0] = [x, y]

			x1 = csp[0][-1][-2][0]
			y1 = csp[0][-1][-2][1]
			x2 = csp[0][-1][-3][0]
			y2 = csp[0][-1][-3][1]
			d = self.distance(x1, y1, x2, y2)
			if d > 0:
				x, y = self.point_at_distance(-d, x1, y1, x2, y2)
				csp[0][-1][-1] = [x, y]

	def removeDoubles(self, p):
		for i in range(1, len(p) - 3, 3):
			if i > len(p) - 3:
				break
			while p[i] == p[i + 1] == p[i + 2] == p[i + 3]:
				p.pop(i + 1)
				p.pop(i + 1)
				p.pop(i + 1)
				if i > len(p) - 3:
					break

		if p[-2] == p[-1] == p[0] == p[1]:
			p[0] = p[-3]
			p.pop(-1)
			p.pop(-1)
			p.pop(-1)

	# Convert path to match Spine's format and remove redundant points
	def cast2spine(self, csp, closed):
		p = []
		for i in range(len(csp[0])):
			for j in range(len(csp[0][i])):
				point = (round(csp[0][i][j][0] - self.hw, 2), round(self.hh - csp[0][i][j][1], 2))
				p.append(point)

		if closed:
			p.pop(-1)
			p.pop(-1)
			p.pop(-1)
			if len(p) >= 12:
				if p[0] == p[3]:
					p.pop(2)
					p.pop(2)
					p.pop(2)
				if p[1] == p[-2]:
					p.insert(0, p.pop(-1))
					p.insert(0, p.pop(-1))
					p.insert(0, p.pop(-1))
					p.pop(1)
					p.pop(1)
					p.pop(1)

		self.removeDoubles(p)
		return list(sum(p, ()))

	def composeParents(self, node, m):
		t = node.get('transform')
		if t:
			m = simpletransform.composeTransform(simpletransform.parseTransform(t), m)
		if node.getparent().tag == inkex.addNS('g','svg') or node.getparent().tag == inkex.addNS('a','svg'):
			m = self.composeParents(node.getparent(), m)
		return m

	def parsePath(self, node, transforms, names):
		name = ""
		for n in names:
			name = n + "_" + name
		name = name + node.get("id")

		m2 = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
		for t in transforms:
			m = simpletransform.parseTransform(t)
			m2 = simpletransform.composeTransform(m2, m)

		m = simpletransform.parseTransform(node.get("transform"))
		m2 = simpletransform.composeTransform(m2, m)


		color = self.get_color(node)

		path = simplepath.formatPath(simplepath.parsePath(node.get('d')))
		subpaths = path.split('M')

		for i in range(1, len(subpaths)):
			subpaths[i] = 'M ' + rstrip(subpaths[i])
			closed = subpaths[i][-1] in ['Z', 'z']

			csp = cubicsuperpath.parsePath(subpaths[i])

			simpletransform.applyTransformToPath(m2, csp)

			if closed:
				self.closed2curves(csp)
			else:
				self.opened2curves(csp)

			vertices = self.cast2spine(csp, closed)

			if len(vertices) >= 9 and closed or len(vertices) >= 6 and not closed:
				self.path2json(name + "_" + str(i), closed, color, vertices)
			else:
				inkex.debug("skipping " + name + "_" + str(i) + ": vertex count < 6 (" + str(len(vertices)) + ")")

	def traverse(self, node, transforms, names):
		if node.tag == inkex.addNS("use","svg"):
			link = node.get(inkex.addNS("href", "xlink"), "#")[1:]
			name = node.get("id")
			if name not in names:
				names.append(name)

			transform = node.get("transform")
			if transform not in transforms:
				transforms.append(transform)
			self.traverse(self.getElementById(link), transforms, names)
		elif node.tag == inkex.addNS("path", "svg"):
			self.parsePath(node, transforms, names)
		elif node.tag == inkex.addNS("g", "svg") or node.tag == inkex.addNS("a", "svg"):
			nodes = node.getchildren()
			name = node.get("id")
			if name not in names:
				names.append(name)

			transform = node.get("transform")
			if transform not in transforms:
				transforms.append(transform)

			for node in nodes:
				transforms2 = []
				for i in transforms:
					transforms2.append(i)
				self.traverse(node, transforms2, names)

	def _main_function(self):
		if self.selected_only:
			for id, node in self.selected.iteritems():
				self.traverse(node, [], [])
		else:
			for node in self.document.getroot().iterchildren():
				self.traverse(node, [], [])

		self.save(self.filename)

e = path2spine()
e.affect()
