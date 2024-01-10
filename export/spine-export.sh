#!/bin/bash


###########################
## Customization Section ##
###########################

# Enter the path to the Spine executable.
# On Windows this should be the Spine.com file.
SPINE_EXE="/Applications/Spine.app/Contents/MacOS/Spine"

# Specify the version of Spine Editor you want to use.
# End with ".XX" to use the latest patch version. For example: 4.1.XX
VERSION="4.1.XX"

# Specify the default export.
# If "json" or "binary" is specified: JSON or binary export will be performed with default settings.
# If "json+pack" or "binary+pack" is specified: Texture packing will also be performed with default settings.
# Alternatively, you can specify the path to an export settings JSON file to use it for the default export settings.
DEFAULT_EXPORT="binary+pack"

# Specify the default output directory when exporting in the default export.
# If the export settings JSON file is found, the output path in it will be used.
DEFAULT_OUTPUT_DIR="export"

# Define whether to perform animation cleanup (true/false).
# Even if set to 'false,' cleanup will be performed if 'cleanUp' is set to 'true' in the export settings JSON file.
CLEANUP="false"

##################
## Begin Script ##
##################

set -e

if [ ! -f "$SPINE_EXE" ]; then
	SPINE_EXE="C:/Program Files/Spine/Spine.com"
	if [ ! -f "$SPINE_EXE" ]; then
		SPINE_EXE="/mnt/c/Program Files/Spine/Spine.com"
		if [ ! -f "$SPINE_EXE" ]; then
			SPINE_EXE="/cygdrive/C/Program Files/Spine/Spine.com"
		fi
	fi
fi

# Check if the Spine editor executable was found.
if [ ! -f "$SPINE_EXE" ]; then
	echo "Error: Spine editor executable was not found."
	echo "Edit the script and set the 'SPINE_EXE' path."
	exit 1
fi

search_dir="$1"
if [ "$#" -eq 0 ]; then
	echo "Enter the path to a directory containing the Spine projects to export:"
	read search_dir
fi

echo "Spine: $SPINE_EXE"
echo "Path: $search_dir"

exportUsingJsonSettings () {
	local json_file=$1
	local file_path=$2

	# Extract the value of the "output" parameter within JSON data using 'sed'.
	# Replaces double-backslash and trailing comma.
	output_path=$(sed -n 's/"output".*"\([^"]*\)"/\1/p' "$json_file" | sed -r 's/\\\\/\\/g' | sed -r 's/,$//g' )

	# Add the appropriate parameters to the 'command_args' array.
	local command_args=("--update" "$VERSION" "--input" "$file_path")

	# Add the --clean option if CLEANUP is set to "true".
	if [ "$CLEANUP" = "true" ]; then
		command_args+=("--clean")
	fi

	# Add other options
	command_args_fallback="${command_args[@]}"
	command_args+=("--export" "$json_file")

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
}

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

# Count the .spine files found.
spine_file_count=0
export_error_count=0

# Save .spine files to a temporary file.
tmp_file=$(mktemp)

# Search recursively for files with extension ".spine".
find "$search_dir" -type f -name "*.spine" > "$tmp_file"

# Check if there are files with extension ".spine" within the specified directory.
while IFS= read -r file_path; do
	spine_file_count=$((spine_file_count + 1))

	# Calculate the relative path from $search_dir.
	relative_path="${file_path#$search_dir/}"

	echo "================================================================================"
	echo "#$spine_file_count : $relative_path"

	# Set parent_path to the .spine file's parent directory.
	parent_path="$(dirname "$file_path")"

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
done < "$tmp_file"

# Delete the temporary file.
rm "$tmp_file"

echo "================================================================================"

if [ $spine_file_count -eq 0 ]; then
	echo "Error: No files with the '.spine' extension were found."
	echo "================================================================================"
	exit 1
else
	echo "Exporting complete."
	if [ $export_error_count -ne 0 ]; then
		echo "$export_error_count error(s) during export."
	fi
	echo "================================================================================"
fi

# Comment out the following line to exit without waiting for a keypress.
read -n 1 -s -r -p "Press any key to exit."
