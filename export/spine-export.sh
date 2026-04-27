#!/bin/bash

###########################
## Customization Section ##
###########################
# Any setting below can be overridden from the caller's shell by exporting an
# environment variable of the same name. Examples:
#   SPINE_EXE=/Applications/Spine.app/Contents/MacOS/Spine ./spine-export.sh <path>
#   MAX_PARALLEL=8 MAX_MEMORY=1G ./spine-export.sh <path>

# SPINE_EXE          - Path to the Spine executable (Spine.com on Windows).
# VERSION            - Spine Editor version. End with .XX for latest patch (eg 4.1.XX).
# DEFAULT_EXPORT     - Used when no .export.json is next to a .spine file.
#                      "json" / "binary" / "json+pack" / "binary+pack", or path to a settings JSON file.
# DEFAULT_OUTPUT_DIR - Output dir name used when falling back to the default export.
# CLEANUP            - true/false. Animation cleanup. Forced on if 'cleanUp' is true in the export JSON.
# MAX_PARALLEL       - Max Spine instances run in parallel. 1 = sequential.
# MAX_MEMORY         - JVM max heap per Spine instance, passed as -Xmx (eg 512m, 1024m). 512m minimum, 4096m default.

: "${SPINE_EXE:=/Applications/Spine.app/Contents/MacOS/Spine}"
: "${VERSION:=4.2.XX}"
: "${DEFAULT_EXPORT:=binary+pack}"
: "${DEFAULT_OUTPUT_DIR:=export}"
: "${CLEANUP:=false}"
: "${MAX_PARALLEL:=2}"
: "${MAX_MEMORY:=512m}"

##################
## Begin Script ##
##################

set -e

waitForKeypress () {
	# Comment out the following line to exit without waiting for a keypress.
	read -n 1 -s -r -p "Press any key to exit."
}

# Try common Windows fallback paths if the configured one doesn't exist.
if [ ! -f "$SPINE_EXE" ]; then
	for try in \
		"C:/Program Files/Spine/Spine.com" \
		"/mnt/c/Program Files/Spine/Spine.com" \
		"/cygdrive/C/Program Files/Spine/Spine.com"
	do
		if [ -f "$try" ]; then SPINE_EXE="$try"; break; fi
	done
fi

# Check if the Spine editor executable was found.
if [ ! -f "$SPINE_EXE" ]; then
	echo "Error: Spine editor executable was not found at '$SPINE_EXE'."
	echo "Edit the script's default or set the 'SPINE_EXE' environment variable before running."
	waitForKeypress
	exit 1
fi

search_dir="$1"
if [ "$#" -eq 0 ]; then
	echo "Enter the path to a directory containing the Spine projects to export:"
	read search_dir
fi

echo "Spine: $SPINE_EXE"
echo "Path: $search_dir"
echo "Parallel jobs: $MAX_PARALLEL  Max heap: $MAX_MEMORY"

# Per-run scratch directory for per-job log files.
log_dir=$(mktemp -d)
trap 'rm -rf "$log_dir"' EXIT

export_error_count=0
active_pids=()
active_logs=()

#############
## Methods ##
#############

exportUsingJsonSettings () {
	local json_file=$1
	local file_path=$2

	# Extract the value of the "output" parameter within JSON data using 'sed'.
	# Replaces double-backslash and trailing comma.
	output_path=$(sed -n 's/"output".*"\([^"]*\)"/\1/p' "$json_file" | sed -r 's/\\\\/\\/g' | sed -r 's/,$//g' )

	local command_args=("-Xmx$MAX_MEMORY" "--update" "$VERSION" "--input" "$file_path")

	# Add the --clean option if CLEANUP is set to "true".
	if [ "$CLEANUP" = "true" ]; then
		command_args+=("--clean")
	fi

	local command_args_fallback=("${command_args[@]}")
	command_args+=("--export" "$json_file")

	echo ">> $SPINE_EXE ${command_args[*]}"
	if "$SPINE_EXE" "${command_args[@]}"; then
		echo "Exported to the following directory: $output_path"
		return 0
	else
		local parent_path; parent_path=$(dirname "$file_path")
		output_path="$parent_path/$DEFAULT_OUTPUT_DIR"
		echo "Export failed. Exporting to default output directory $output_path."

		command_args_fallback+=("--output" "$output_path" "--export" "$json_file")
		echo ">> $SPINE_EXE ${command_args_fallback[*]}"
		if "$SPINE_EXE" "${command_args_fallback[@]}"; then
			echo "Exported to the following default output directory: $output_path"
			return 0
		else
			echo "Export to default output directory failed."
			return 1
		fi
	fi
}

exportUsingDefaultSettings () {
	local parent_path="$1"
	local file_path="$2"

	local command_args=("-Xmx$MAX_MEMORY" "--update" "$VERSION" "--input" "$file_path")

	if [ "$CLEANUP" = "true" ]; then
		command_args+=("--clean")
	fi

	command_args+=("--output" "$parent_path/$DEFAULT_OUTPUT_DIR" "--export" "$DEFAULT_EXPORT")

	echo ">> $SPINE_EXE ${command_args[*]}"
	if "$SPINE_EXE" "${command_args[@]}"; then
		echo "Exported to the following directory: $parent_path/$DEFAULT_OUTPUT_DIR"
		return 0
	else
		echo "Export failed."
		return 1
	fi
}

isValidExportJson () {
	local json_file="$1"
	local export_type
	export_type=$(grep 'class":\s*"export-.*"' "$json_file" || true)
	if [[ -z "$export_type" ]]; then
		return 1
	else
		return 0
	fi
}

# Process a single .spine file. All output goes to current stdout/stderr,
# which the caller may redirect to a per-job log when running in parallel.
processSpineFile () {
	local file_path="$1"
	local job_id="$2"
	local local_error=0

	local relative_path="${file_path#$search_dir/}"
	echo "================================================================================"
	echo "#$job_id : $relative_path"

	local parent_path; parent_path="$(dirname "$file_path")"

	local json_files=()
	shopt -s nullglob
	for json_file in "$parent_path"/*.export.json; do
		json_files+=("$json_file")
	done
	shopt -u nullglob

	if [ ${#json_files[@]} -ge 2 ]; then
		echo "Multiple '.export.json' files were found:"
		local json_file_count=${#json_files[@]}
		local export_count=0
		for json_file in "${json_files[@]}"; do
			if isValidExportJson "$json_file"; then
				echo "--------------------------------------------------------------------------------"
				export_count=$((export_count + 1))
				local relative_json_path="${json_file#$search_dir/}"
				echo "($export_count/$json_file_count) Exporting with the export settings JSON file: $relative_json_path"
				if ! exportUsingJsonSettings "$json_file" "$file_path"; then
					local_error=1
				fi
			else
				echo "The '.export.json' file does not appear to be export settings JSON. This file will be skipped."
			fi
		done
	elif [ ${#json_files[@]} -eq 1 ]; then
		local json_file=${json_files[0]}
		if isValidExportJson "$json_file"; then
			local relative_json_path="${json_file#$search_dir/}"
			echo "Exporting with the export settings JSON file: $relative_json_path"
			if ! exportUsingJsonSettings "$json_file" "$file_path"; then
				local_error=1
			fi
		else
			echo "The '.export.json' file does not appear to be export settings JSON. Default settings ('$DEFAULT_EXPORT') will be used for export."
			if ! exportUsingDefaultSettings "$parent_path" "$file_path"; then
				local_error=1
			fi
		fi
	else
		echo "No '.export.json' files were found in the same directory as the Spine project. Default settings ('$DEFAULT_EXPORT') will be used for export."
		if ! exportUsingDefaultSettings "$parent_path" "$file_path"; then
			local_error=1
		fi
	fi

	return $local_error
}

# Print logs for any background jobs that have finished, and reap them.
# Output is in completion order; each log starts with its own #N header.
drainCompleted () {
	local new_pids=()
	local new_logs=()
	local i pid log
	for i in "${!active_pids[@]}"; do
		pid="${active_pids[$i]}"
		log="${active_logs[$i]}"
		if kill -0 "$pid" 2>/dev/null; then
			new_pids+=("$pid")
			new_logs+=("$log")
		else
			if wait "$pid"; then :; else
				export_error_count=$((export_error_count + 1))
			fi
			cat "$log" 2>/dev/null || true
			rm -f "$log"
		fi
	done
	active_pids=("${new_pids[@]}")
	active_logs=("${new_logs[@]}")
}

waitForSlot () {
	while [ "${#active_pids[@]}" -ge "$MAX_PARALLEL" ]; do
		sleep 0.5
		drainCompleted
	done
}

waitAll () {
	while [ "${#active_pids[@]}" -gt 0 ]; do
		sleep 0.5
		drainCompleted
	done
}

###################
## Main Loop     ##
###################

# Save .spine files to a temporary file.
# Use bash's recursive globbing instead of external `find` so we don't get
# tripped up by Windows' find.exe shadowing GNU find on Git Bash / WSL.
tmp_file="$log_dir/filelist.txt"
: > "$tmp_file"
shopt -s globstar nullglob
for f in "$search_dir"/**/*.spine; do
	[ -f "$f" ] && printf '%s\n' "$f" >> "$tmp_file"
done
shopt -u globstar nullglob

spine_file_count=0

while IFS= read -r file_path; do
	spine_file_count=$((spine_file_count + 1))
	job_id=$spine_file_count

	if [ "$MAX_PARALLEL" -le 1 ]; then
		# Sequential: stream output directly so it appears live.
		if ! processSpineFile "$file_path" "$job_id"; then
			export_error_count=$((export_error_count + 1))
		fi
	else
		waitForSlot
		log_file="$log_dir/job-$job_id.log"
		( processSpineFile "$file_path" "$job_id" >"$log_file" 2>&1 ) &
		active_pids+=("$!")
		active_logs+=("$log_file")
		drainCompleted
	fi
done < "$tmp_file"

# Wait for any remaining background jobs.
waitAll
drainCompleted

echo "================================================================================"

if [ $spine_file_count -eq 0 ]; then
	echo "Error: No files with the '.spine' extension were found."
	echo "================================================================================"
	waitForKeypress
	exit 1
else
	echo "Exporting complete."
	if [ $export_error_count -ne 0 ]; then
		echo "$export_error_count error(s) during export."
		echo "================================================================================"
		waitForKeypress
		exit 1
	fi
	echo "================================================================================"
fi

waitForKeypress
