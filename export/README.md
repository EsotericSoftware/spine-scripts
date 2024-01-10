# spine-export.sh / spine-export.bat
These scripts can be used for exporting images, video, or skeleton data in JSON or binary format. The scripts look for an export settings file in the same folder as the project file, so each project can be exported differently.

Using a shell script to export many projects at once has many advantages:

- Export any number of project files all at once.
- Your exports always use the correct settings. No need to rely on animators to use the right settings every time.
- Your software's build process can run the export scripts, ensuring every build always has the latest export files. Animators don't need to remember to perform exports after every change to the project files.
- When updating to a newer Spine version, all your projects must be re-exported. When you have scripts setup, this is super easy!

The batch script `spine-export.bat` is for Windows and the Bash shell script `spine-export.sh` is for macOS and Linux.

---

## Script usage
You can watch a video demonstrating how to use the script here:  
**YouTube**: https://youtu.be/_orkfUSl9lk
[![Batch export using scripts_00473](https://github.com/misaki-eymard/custom-spine-scripts/assets/85478846/c9b483e4-9155-435a-b762-ae81a8333860)]('https://youtu.be/_orkfUSl9lk')

---

## How to use
### Make customizations
If you open the script with a text editor, you'll find a "Customization Section" at the top (the following image is from `spine-export.bat` but `spine-export.sh` is very similar):  

![CustomaizationSection](https://github.com/misaki-eymard/custom-spine-scripts/assets/85478846/007581d6-0e09-4377-96e6-92ac908ad24f)

There are five customizations is available, and the first three settings should be reviewed before running the script:

1. **Path to the Spine executable file:** The path where Spine is installed. By default, a path is specified that assumes the default installation location. If Spine is not found here, the script will look in other common locations. If you have installed Spine in a location other than the default, replace this with the correct path.

2. **Version of the Spine editor to launch:** The version of the Spine editor that you want to use for performing the exports. You can specify the version you want to use. By default, the latest Spine 4.1 will be launched.

3. **Default export:** This script looks for an export settings JSON file in the same folder as the Spine project. If that is not found, it uses the export setting specified here. The default setting is `binary+pack` which exports in binary format and packs a texture atlas. You can specify a specific .export.json file path. For example, if you want to export all animations as PNG sequence images with the same settings, save the export settings as an `.export.json` file and replace this value with the path to that file, avoiding the need to place an export settings JSON file for each Spine project.

5. **Name of the output directory for default export:** By default, a directory named "export" is created in the same hierarchy as the Spine project to be exported, and the output is placed there.

6. **Whether to clean up the animation or not:** Even if set to false, cleanup will be performed if “cleanUp” is true in the export settings JSON file.

---

### Running spine-export.bat
On Windows there are a few ways to run the script:

- Drag and drop a folder on the `spine-export.bat` file.
- Double click the `spine-export.bat` file to open a CMD window, then type or paste a path, or drag and drop a folder on to the CMD window.
- Run the `spine-export.bat` file from a CMD prompt, then type or paste a path, or drag and drop a folder on to the CMD window.
- Run the `spine-export.bat` file from a CMD prompt with a path as the first parameter.
```
spine-export.bat path\to\spine\project\folder
```

The script searches the specified folder and all subfolders. If it finds a `.spine` file it performs an export.

---

### Running spine-export.sh
**1.Make the script executable**  
Open Terminal, navigate to the directory where it is located, and then grant it permission with this command:
```
chmod +x spine-export.sh
```

**2.Run the script**  
To run the script, specify "./spine-export.sh" and then the path to the directory containing the Spine project you wish to export. For example:
```
./spine-export.sh /path/to/spine/project/directory/
```

If you do not specify a path when executing the script, the script will prompt for a path to be entered.

The script searches the specified directory and all subdirectories. If it finds a `.spine` file it performs an export.

---

### Default export settings
To specify more detailed default export settings, you need to prepare an export settings JSON file.

#### Save an export settings file
On the export window in the Spine editor, there is a Save button in the lower left corner that allows you to save the current export settings as a JSON file.  

![image1](https://github.com/misaki-eymard/custom-spine-scripts/assets/85478846/df7e97a3-a580-4f02-8aa5-693bd667f081)

The saved export settings file will have the extension `.export.json`.  

![image3](https://github.com/misaki-eymard/custom-spine-scripts/assets/85478846/aa6807e6-daa3-4492-80a6-f7c69c55555d)


If `Pack` was checked in the export settings then the texture packer settings are also saved in the `.export.json` file.  

![image2](https://github.com/misaki-eymard/custom-spine-scripts/assets/85478846/37f21286-1efe-49cd-8a18-35708c2ff51f)


#### Set the default export settings
Open the script file with any text editor and change the value of `DEFAULT_FORMAT` to the path of your .export.json file. For example:
```
DEFAULT_FORMAT=/path/to/spineboy.export.json
```
These settings will be used if no `.export.json` file is found next to a project file.

Note that the exported files will be output using `DEFAULT_OUTPUT_DIR` in the Customization Section, not the output path in the `.export.json` file.

---

### Export settings per project
To export a Spine project with different settings, prepare an `.export.json` file with the settings and saved it the same folder as the Spine project. For example, the filesystem hierarchy could look like this:
```
<Folder where you specify the path when running the script>
        ├── 01
        │   ├── skeleton1.spine
        │   ├── skeleton1.export.json
        │   ├── images
        ├── 02
        │   ├── skeleton2.spine
        │   ├── skeleton2.export.json
        │   ├── images 
        └── 03
            ├── skeleton3.spine
            ├── skeleton3.export.json
            └── images
```

The .export.json file name does not need to match the project file name.

#### Multiple exports for the same project
To export a single skeleton multiple times with different export settings, prepare and include that many .export.json files. For example, to export the skeleton data both in binary format and as a PNG sequence, your filesystem hierarchy could look like this:
```
<Folder where you specify the path when running the script>
        ├── 01
        │   ├── skeleton1.spine
        │   ├── skeleton1_Binary.export.json
        │   ├── skeleton1_PNG.export.json
        │   ├── images
        ├── 02
        │   ├── skeleton2.spine
        │   ├── skeleton2_Binary.export.json
        │   ├── skeleton2_PNG.export.json
        │   ├── images 
        └── 03
            ├── skeleton3.spine
            ├── skeleton3_Binary.export.json
            ├── skeleton3_PNG.export.json
            └── images
```

#### Mixing default and custom settings
A project file without an .export.json file in the same folder will be exported with default settings:
```
<Folder where you specify the path when running the script>
        ├── 01
        │   ├── skeleton1.spine
        │   ├── skeleton1_Binary.export.json
        │   ├── skeleton1_PNG.export.json
        │   ├── images
        ├── 02
        │   ├── skeleton2.spine <This skeleton is exported with the default format>
        │   ├── images 
        └── 03
            ├── skeleton3.spine
            ├── skeleton3_Binary.export.json
            ├── skeleton3_PNG.export.json
            └── images
```

---

# Script Details

You are welcome to modify the script to meet your needs. We have written comments in the script to describe everything it does and more details can also be found below. (The following explanation is based on `spine-export.sh` because it is more readable.)

## Find .spine projects
In this script, the following code generates a temporary file and stores the path in “tmp_file”:
```
# Save .spine files to a temporary file.
tmp_file=$(mktemp)
```

The subsequent code recursively searches for files with a ".spine" extension and records them in the temporary file created earlier:
```
# Search recursively for files with extension ".spine".
find "$search_dir" -type f -name "*.spine" > "$tmp_file"
```

This process compiles a list of discovered Spine projects.

Then, encapsulating the export procedure, the script reads the contents of the temporary file line by line into `file_path`. The operations within the while...do block are repeated until all Spine projects listed in the temporary file have been processed:
```
while IFS= read -r file_path; do
　　　　...
done < "$tmp_file"
```

The initial segment of the while statement outputs a message, updating the script executor on the number of processed Spine projects and the location of the current export:
```
	spine_file_count=$((spine_file_count + 1))

	# Calculate the relative path from $search_dir.
	relative_path="${file_path#$search_dir/}"

	echo "================================================================================"
	echo "#$spine_file_count : $relative_path"
```

Then, the parent directory of the `.spine` file is stored in `parent_path`:
```
	# Set parent_path to the .spine file's parent directory.
	parent_path="$(dirname "$file_path")"
```

The following part finds for files with the extension `.export.json` in the same directory as the `.spine file`, and if found, adds them to the `json_files` array:
```
	# Initialize the json_files array.
	json_files=()

	# Enable nullglob.
	shopt -s nullglob

	# Find .export.json files within the specified directory and add them to the json_files array.
	for json_file in "$parent_path"/*.export.json; do
		json_files+=("$json_file")
	done

	# Disable nullglob.
	shopt -u nullglob
```

The reason nullglob is enabled before the loop process of adding the `json_file` to the `json_files` array is that if no `.export.json` file is found in that directory, the loop will proceed leaving it empty.

After that, the process diverges depending on whether the contents of the json_files array are 2 or more, one, or zero. If 2 or more, the script informs that multiple `.export.json` files were found and the export is performed, counting the number of times the export was performed.
If zero, the script informs that the export will be performed with default settings and the export is performed.
```
	if [ ${#json_files[@]} -ge 2 ]; then
		echo "Multiple '.export.json' files were found:"

		# Get the length of the json_files array.
		json_file_count=${#json_files[@]}

		# Count the export operations.
		export_count=0
		# Process each .export.json.
		for json_file in "${json_files[@]}"; do
			if isValidExportJson "$json_file"; then
				echo "--------------------------------------------------------------------------------"
				export_count=$((export_count + 1))

				# Calculate the relative path from $search_dir.
				relative_json_path="${json_file#$search_dir/}"
				echo "($export_count/$json_file_count) Exporting with the export settings JSON file: $relative_json_path"
				exportUsingJsonSettings "$json_file" "$file_path"
			else
				echo "The '.export.json' file does not appear to be export settings JSON. This file will be skipped."
			fi
		done
	elif [ ${#json_files[@]} -eq 1 ]; then
		# Process the .export.json file.
		json_file=${json_files[0]}
		if isValidExportJson "$json_file"; then
			relative_json_path="${json_file#$search_dir/}"
			echo "Exporting with the export settings JSON file: $relative_json_path"
			exportUsingJsonSettings "$json_file" "$file_path"
		else
			echo "The '.export.json' file does not appear to be export settings JSON. Default settings ('$DEFAULT_EXPORT') will be used for export."
			exportUsingDefaultSettings "$parent_path" "$file_path"
		fi
	else
		echo "No '.export.json' files were found in the same directory as the Spine project. Default settings ('$DEFAULT_EXPORT') will be used for export."
		exportUsingDefaultSettings "$parent_path" "$file_path"
	fi
```

If one or more `.export.json` files are found, the contents of the JSON file are checked with the function `isValidExportJson`:
```
isValidExportJson () {
	local json_file="$1"
	local export_type=$(grep 'class":\s*"export-.*"' "$json_file")
	# Check if '"class": "export-"' is found, return 1 if not.
	if [[ -z "$export_type" ]] ; then
		return 1
	else
		return 0
	fi
}
```

This process checks that the parameter "class" exists in the `.export.json` file and that the value begins with "export-". It returns 0 (success) if the parameter is found, and 1 (error) if not.

If it is not a valid `.export.json`, skip that export if more than one `.export.json` is found. If only that `.export.json` is found, the export is performed with default settings.

## Exporting a found .spine project
The script contains two primary functions: `exportUsingJsonSettings()` and `exportUsingDefaultSettings()`.
Upon finding a file with a `.spine` extension,  `exportUsingJsonSettings()` is called when a valid `.export.json` file is present in the same directory. Conversely, if the file is not found, `exportUsingDefaultSettings()` is called.

### exportUsingDefaultSettings()
```
exportUsingDefaultSettings () {
	local parent_path="$1"
	local file_path="$2"

	local command_args=("--update" "$VERSION" "--input" "$file_path")

	# Add the -m option if CLEANUP is set to "true".
	if [ "$CLEANUP" = "true" ]; then
		command_args+=("--clean")
	fi

	# Add other output and export options.
	command_args+=("--output" "$parent_path/$DEFAULT_OUTPUT_DIR" "--export" "$DEFAULT_EXPORT")
	if "$SPINE_EXE" "${command_args[@]}"; then
		echo "Exported to the following directory: $parent_path/$DEFAULT_OUTPUT_DIR"
	else
		export_error_count=$((export_error_count + 1))
		echo "Export failed."
	fi
}
```

This function requires the arguments `parent_path` and `file_path` when called. `parent_path` is the path to the parent directory of the found `.spine` file. `file_path` is the path of the `.spine` file.

The array `command_args` stores the Spine version, the path to the Spine project for export, the output directory path, and the export settings JSON path. This means that the bolded segments in the following commands are grouped together in `command_args`:

Spine **--update (Version number) -i (Path to the SpineProject file) -o (Path to the output directory) -e (Export settings)**

The command "${command_args[@]}" passes these commands to the Spine executable for the execution of the export process.

Upon completion of the export, the script notifies that it has exported in the same directory as the Spine project and then concludes the loop.

### exportUsingJsonSettings()
*The same parts as in exportUsingDefaultSettings() are omitted in this explanation.

The following line extracts the value of the "output" parameter from the `.export.json` file and stores it in the `output_path` variable:
```
	output_path=$(sed -n 's/"output".*"\([^"]*\)"/\1/p' "$json_file" | sed -r 's/\\\\/\\/g' | sed -r 's/,$//g' )
```

If the output path specified in the `.export.json` file is invalid, Spine will return an error. The following part counts this error, finds an alternative possible output path, and performs the export:
```
	if "$SPINE_EXE" "${command_args[@]}"; then
		echo "Exported to the following directory: $output_path"
	else
		export_error_count=$((export_error_count + 1))
		parent_path=$(dirname "$file_path")
		output_path="$parent_path/$DEFAULT_OUTPUT_DIR"
		echo "Export failed. Exporting to default output directory $output_path."

		command_args_fallback+=("--output" "$output_path" "--export" "$json_file")
		if "$SPINE_EXE" "${command_args_fallback[@]}"; then
			echo "Exported to the following default output directory: $output_path"
		else
			echo "Export to default output directory failed."
		fi
	fi
```

Upon completion of the export, the script notifies the specified output directory in the .export.json file that the file has been exported, and then exits the loop.

### End of loop
By default, the script waits for a keystroke, but if you do not need this, comment out the following line:
```
read -n 1 -s -r -p "Press any key to exit."
```
