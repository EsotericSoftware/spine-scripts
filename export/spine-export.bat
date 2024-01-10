@echo off
setlocal enabledelayedexpansion

:::::::::::::::::::::::::::
:: Customization Section ::
:::::::::::::::::::::::::::

:: Enter the path to the Spine executable.
:: This should be the Spine.com file.
SET SPINE_EXE="C:\Program Files\Spine\Spine.com"

:: Specify the version of Spine Editor you want to use.
:: End with ".XX" to use the latest patch version. For example: 4.1.XX
SET VERSION=4.1.XX

:: Specify the default export.
:: If "json" or "binary" is specified: JSON or binary export will be performed with default settings.
:: If "json+pack" or "binary+pack" is specified: Texture packing will also be performed with default settings.
:: Alternatively, you can specify the path to an export settings JSON file to use it for the default export settings.
SET DEFAULT_EXPORT=binary+pack

:: Specify the default output folder(directory) when exporting in the default export.
:: If the export settings JSON file is found, the output path in it will be used.
SET DEFAULT_OUTPUT_DIR=export

:: Decide whether to perform animation cleanup (true/false).
:: Even if set to 'false,' cleanup will be performed if 'cleanUp' is set to 'true' in the export settings JSON file.
SET CLEANUP=false

::::::::::::::::::
:: Begin Script ::
::::::::::::::::::

:: Get the script directory.
SET "SCRIPT_DIR=%~dp0"
CD /D "%SCRIPT_DIR%"

:: Check if the Spine editor executable was found.
IF NOT EXIST %SPINE_EXE% (
   SET SPINE_EXE="C:\Program Files\Spine\Spine.com"
)
IF NOT EXIST !SPINE_EXE! (
	echo Error: Spine editor executable was not found.
	echo Edit the script and set the 'SPINE_EXE' path.
	IF /I %0 EQU "%~dpnx0" PAUSE
	exit /B 1
)

SET "search_dir=%1"
IF "%~1"=="" (
	SET /P "search_dir=Enter the path to a folder containing the Spine projects to export: "
)
:: Remove quotes from input search dir.
SET search_dir=%search_dir:"=%

echo Spine: !SPINE_EXE:"=!
echo Path: %search_dir%

:: Count the .spine files found.
SET spine_file_count=0
SET export_error_count=0

:: Save .spine files to a temporary file.
SET "tmp_file=%temp%\tempfile.tmp"

:: Search recursively for files with extensions ".spine" or ".json".
dir /B /S /A-D "%search_dir%"\*.spine > "%tmp_file%"

:: Check if there are files with extension ".spine" within the specified folder.
FOR /F "tokens=*" %%A in (%tmp_file%) DO ( 
	SET "file_path=%%~A"
	SET "file_extension=%%~xA"

	IF /I "!file_extension!"==".spine" (
		SET /A spine_file_count+=1

		:: Set relative_path by removing the search_dir prefix.
		SET "relative_path=%%A"
		SET "relative_path=!relative_path:%search_dir%\=!"

		echo ================================
		echo #!spine_file_count! : !relative_path!

		:: Set parent_path to the .spine file's parent folder.
		SET "parent_path=%%~dpA"
		:: Remove trailing backslash.
		SET "parent_path=!parent_path:~0,-1!"

		:: Initialize the json_files array.
		SET "json_files="

		:: Count the .export.j	son files found.
		SET json_files_count=0

		:: Find .export.json files within the specified folder and add them to the json_files array.
		FOR %%D IN ("!parent_path!\"*.export.json) DO (
			CALL SET json_files[!json_files_count!]=%%D
			SET /A json_files_count+=1
		)

		:: Check the number of .export.json files.
		IF !json_files_count! GEQ 2 (
			echo Multiple '.export.json' files were found:
			SET "json_file_count=!json_files_count!"

			:: Count the export operations.
			SET export_count=0

			:: Process each .export.json.
			FOR /L %%E IN (0, 1, !json_files_count!) DO (
				SET "json_file=!json_files[%%E]!"

				FOR /F %%F IN ("!json_file!") DO (
					CALL :isValidExportJson isValidJson "!json_file!"
					IF !isValidJson!==true (
						echo ================================
						SET /A export_count+=1
						SET "relative_json_path=!json_file:%search_dir%\=!"
						echo !export_count!/!json_file_count! Exporting with the export settings JSON file: !relative_json_path!
						CALL :exportUsingJsonSettings "!json_file!" "!file_path!"
					) ELSE (
						echo The '.export.json' file does not appear to be export settings JSON. This file will be skipped.
					)
				)
			)
		) ELSE IF !json_files_count! EQU 1 (
			:: Process the .export.json file.
			SET "json_file=!json_files[0]!"
			FOR /F %%K IN ("!json_file!") DO (
				CALL :isValidExportJson isValidJson "!json_file!"
				IF !isValidJson!==true (
					SET "relative_json_path=!json_file:%search_dir%\=!"
					echo Exporting with the export settings JSON file: !relative_json_path!
					CALL :exportUsingJsonSettings "!json_file!" "!file_path!"
				) ELSE (
					echo The '.export.json' file does not appear to be export settings JSON. Default settings ^(!DEFAULT_EXPORT!^) will be used for export.
					CALL :exportUsingDefaultSettings "!parent_path!" "!file_path!"
				)
			)
		) ELSE (
			echo No '.export.json' files were found in the same folder as the Spine project. Default settings ^(!DEFAULT_EXPORT!^) will be used for export.
			CALL :exportUsingDefaultSettings "!parent_path!" "!file_path!"
		)
	)
)

:: Delete the temporary file
DEL "%tmp_file%"

echo ================================
IF %spine_file_count% EQU 0 (
	echo Error: No files with the '.spine' extension were found.
	echo ================================
	IF /I %0 EQU "%~dpnx0" PAUSE
	exit /B 1
) ELSE (
	echo Exporting complete.
	IF !export_error_count! NEQ 0 (
		echo !export_error_count! error^(s^) during export.
	)
	echo ================================
)
exit /B 0


:::::::::::::
:: Methods ::
:::::::::::::

:isValidExportJson
	:: %1 is output boolean parameter
	SET "json_file=%~2"
	SET "%1=false"

	>NUL findstr /r "class\":.*\"export-.*\"" "!json_file!"
	IF %ERRORLEVEL% EQU 0 (
		SET "%1=true"
		exit /B 0
	) ELSE (
		exit /B 0
	)
exit /B 0

:exportUsingJsonSettings
	SET "json_file=%~1"
	SET "file_path=%~2"

	FOR /F "usebackq tokens=2 delims=,%TAB% " %%M IN (`findstr /r "output[^^F].*" "!json_file!"`) DO SET "output_path=%%M"

	:: Add the --clean option if CLEANUP is set to "true".
	SET CLEANUP_FLAG=
	IF "%CLEANUP%"=="true" (
		SET CLEANUP_FLAG="--clean"
	)
	
	!SPINE_EXE! --update %VERSION% --input "!file_path!" !CLEANUP_FLAG! --export "!json_file!"
	IF !ERRORLEVEL!==0 (
		echo Exported to the following folder: !output_path!
	) ELSE (
		SET /A export_error_count +=1
		FOR %%A IN ("!file_path!") DO SET "parent_path=%%~dpA"
		SET output_path="!parent_path!%DEFAULT_OUTPUT_DIR%"
		echo Export failed. Exporting to default output folder !output_path!.
		
		!SPINE_EXE! --update %VERSION% --input "!file_path!" !CLEANUP_FLAG! --output "!output_path!" --export "!json_file!"
		IF !ERRORLEVEL!==0 (
			echo Exported to the following folder: !output_path!
		) ELSE (
			echo Export to default output folder failed.
		)
	)

	
exit /B 0

:exportUsingDefaultSettings
	SET "parent_path=%~1"
	SET "file_path=%~2"

	echo Exporting with default settings.
	
	:: Add the -m option if CLEANUP is set to "true".
	SET CLEANUP_FLAG=
	IF "%CLEANUP%"=="true" (
		SET CLEANUP_FLAG="--clean"
	)

	!SPINE_EXE! --update %VERSION% --input "!file_path!" !CLEANUP_FLAG! --output "!parent_path!\export" --export !DEFAULT_EXPORT!
	IF !ERRORLEVEL!==0 (
		echo Exported to the following folder: !parent_path!
	) ELSE (
		SET /A export_error_count +=1
		echo Export failed.
	)
exit /B 0
