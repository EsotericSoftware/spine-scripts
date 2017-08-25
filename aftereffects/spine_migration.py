#!/bin/python
#
# spine_migration.py
# Script Version 1
#
# Spine data version 2.0.0
#  Change the way that scale timelines are evaluated
# 

from __future__ import print_function
import os, sys
import json
import argparse

#
# Initialize and parse command line arguments
#
p = argparse.ArgumentParser(
	description='Migrate Spine json files to version 2.0.0 compatibility.')
p.add_argument( "path", help="One or more files or directories", action="store", nargs="+")
p.add_argument( "-r", "--recursive", help="If the path is a directory, recusively scan it for Spine data files.",
	default=False, action="store_true")
p.add_argument( "-v", "--verbose", help="Copious output of all activity.", default=False, action="store_true")
p.add_argument( "-q", "--quiet", help="Quiet mode.  Output nothing.", default=False, action="store_true")

args = p.parse_args();

#
# Functions
#
def warning(*objs):
    print("WARNING: ", *objs, file=sys.stderr)

def scan_directory(directory_name):
	if args.verbose:
		print("Scanning:",directory_name)
	names = os.listdir(directory_name)
	if not directory_name.endswith("/"):
		directory_name += "/"
	for name in names:
		name = directory_name + name
		if os.path.isdir(name):
			if args.recursive:
				scan_directory(name)
			else:
				if args.verbose:
					print("Skipping:",name)
		else:
			if name.endswith(".json"):
				migrate_file(name)

def migrate_file( name ):
	if args.verbose:
		print("Examining:",name)
	change_count = 0
	# Open file and see if any migrations need be applied
	with open(name) as file:
		try:
			spine_data = json.load(file)
		except ValueError as e:
			warning("Error reading json from file",name)
			spine_data = None
		if spine_data is not None and "bones" in spine_data and "slots" in spine_data:
			change_count += migrate( spine_data )
	# If any changes were made, overwrite the file
	if change_count > 0:
		with open(name,"w") as file:
			json.dump(spine_data,file,indent=1)
		if not args.quiet:
			print("Migrated:",name)
	else:
		if args.verbose:
			print("No changes:",name)

	return change_count

def migrate( spine_data ):
	version = get_version( spine_data["skeleton"]["spine"] ) if "skeleton" in spine_data else (1,0,0)
	change_count = 0
	if version < (2,0,0):
		change_count += migrate_2_0_0( spine_data )
	return change_count

def migrate_2_0_0( spine_data ):
	change_count = 0
	for animation_name in spine_data["animations"]:
		animation_data = spine_data["animations"][animation_name]
		if "bones" in animation_data:
			for bone_name in animation_data["bones"]:
				bone_animation_data = spine_data["animations"][animation_name]["bones"][bone_name]
				if "scale" in bone_animation_data:
					bone_data = filter( lambda x: x["name"] == bone_name, spine_data["bones"])[0]
					# Get the bone's scale and don't let it get below 0.001
					bone_scale_x = bone_data["scaleX"] if "scaleX" in bone_data else 1.0
					bone_scale_y = bone_data["scaleY"] if "scaleY" in bone_data else 1.0
					if bone_scale_x != 1.0 or bone_scale_y != 1.0:
						change_count = change_count + 1
						# Replace the values on the timeline with the final scale values first
						for scale_keyframe in bone_animation_data["scale"]:
							scale_keyframe["x"] = scale_keyframe["x"] + bone_scale_x - 1
							scale_keyframe["y"] = scale_keyframe["y"] + bone_scale_y - 1
						# Don't let the bone go below scale 0.001
						if bone_scale_x < 0.001 and bone_scale_x > -0.001:
							if bone_scale_x < 0.0:
								bone_scale_x = 0.001
							else:
								bone_scale_x = -0.001
							bone_data["scaleX"] = bone_scale_x
						if bone_scale_y < 0.001 and bone_scale_y > -0.001:
							if bone_scale_y < 0.0:
								bone_scale_y = 0.001
							else:
								bone_scale_y = -0.001
							bone_data["scaleY"] = bone_scale_y
						# Replace the values on the timeline with values relative to the bone scale
						for scale_keyframe in bone_animation_data["scale"]:
							scale_keyframe["x"] = scale_keyframe["x"] / bone_scale_x
							scale_keyframe["y"] = scale_keyframe["y"] / bone_scale_y
	if change_count > 0:
		if "skeleton" in spine_data:
			spine_data["skeleton"]["spine"] = "2.0.0"
		else:
			spine_data["skeleton"] = { "spine": "2.0.0", "width": 0, "height": 0, "hash":"" }
	return change_count

def get_version(version_string):
    return tuple(map(int, (version_string.split("."))))

#
# Scan all directories and files provided
#
for name in args.path:
	if not os.path.exists(name):
		warning("File or directory",name,"not found.")
		continue
	if os.path.isdir(name):
		scan_directory(name)
	else:
		migrate_file(name)