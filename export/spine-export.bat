@echo off
setlocal enabledelayedexpansion

:::::::::::::::::::::::::::
:: Customization Section ::
:::::::::::::::::::::::::::
:: Any setting below can be overridden from the caller's shell by setting an
:: environment variable of the same name. Examples:
::   set SPINE_EXE=C:\Dev\spine\other\installs\Spine\Spine.com
::   set MAX_PARALLEL=8
::   spine-export.bat <path>

:: SPINE_EXE       - Path to the Spine.com file.
:: VERSION         - Spine Editor version. End with .XX for latest patch (eg 4.1.XX).
:: DEFAULT_EXPORT  - Used when no .export.json is next to a .spine file.
::                   "json" / "binary" / "json+pack" / "binary+pack", or path to a settings JSON file.
:: DEFAULT_OUTPUT_DIR - Output dir name used when falling back to the default export.
:: CLEANUP         - true/false. Animation cleanup. Forced on if 'cleanUp' is true in the export JSON.
:: MAX_PARALLEL    - Max Spine instances run in parallel. 1 = sequential.
:: MAX_MEMORY      - JVM max heap per Spine instance, passed as -Xmx (eg 512m, 1024m). 512m minimum, 4096m default.

IF NOT DEFINED SPINE_EXE          SET "SPINE_EXE=C:\Program Files\Spine\Spine.com"
IF NOT DEFINED VERSION            SET "VERSION=4.2.XX"
IF NOT DEFINED DEFAULT_EXPORT     SET "DEFAULT_EXPORT=binary+pack"
IF NOT DEFINED DEFAULT_OUTPUT_DIR SET "DEFAULT_OUTPUT_DIR=export"
IF NOT DEFINED CLEANUP            SET "CLEANUP=false"
IF NOT DEFINED MAX_PARALLEL       SET "MAX_PARALLEL=2"
IF NOT DEFINED MAX_MEMORY         SET "MAX_MEMORY=512m"

:: Strip any surrounding quotes from path-like values so callers can write either
::   set SPINE_EXE=C:\path\Spine.com   or   set SPINE_EXE="C:\path\Spine.com"
SET SPINE_EXE=%SPINE_EXE:"=%

::::::::::::::::::
:: Begin Script ::
::::::::::::::::::

:: Worker-mode dispatch: when re-invoked as a child to process one file, jump to the worker.
IF /I "%~1"=="--worker" (
	CALL :workerMain %2 %3 %4 %5 %6
	exit /B !ERRORLEVEL!
)

:: Get the script directory.
SET "SCRIPT_DIR=%~dp0"
CD /D "%SCRIPT_DIR%"

:: Check if the Spine editor executable was found.
IF NOT EXIST "%SPINE_EXE%" (
	echo Error: Spine editor executable was not found at "%SPINE_EXE%".
	echo Edit the script's default or set the 'SPINE_EXE' environment variable before running.
	IF /I %0 EQU "%~dpnx0" PAUSE
	exit /B 1
)

SET "search_dir=%1"
IF "%~1"=="" (
	SET /P "search_dir=Enter the path to a folder containing the Spine projects to export: "
)
:: Remove quotes from input search dir.
SET search_dir=%search_dir:"=%

echo Spine: !SPINE_EXE!
echo Path: %search_dir%
echo Parallel jobs: !MAX_PARALLEL!  Max heap: %MAX_MEMORY%

:: Per-run scratch directory for marker / log files.
SET "run_id=%RANDOM%%RANDOM%"
SET "run_dir=%temp%\spine-export-%run_id%"
mkdir "%run_dir%" >NUL 2>&1

:: Save .spine files to a temporary file.
SET "tmp_file=%run_dir%\filelist.txt"
dir /B /S /A-D "%search_dir%"\*.spine > "%tmp_file%" 2>NUL

SET spine_file_count=0
SET export_error_count=0

:: Enumerate .spine files and launch (throttled) parallel workers.
FOR /F "usebackq tokens=*" %%A in ("%tmp_file%") DO (
	SET "file_path=%%~A"
	SET "file_extension=%%~xA"

	IF /I "!file_extension!"==".spine" (
		SET /A spine_file_count+=1
		SET "job_id=!spine_file_count!"

		:: Throttle: wait for an open slot (drains finished logs while waiting).
		CALL :waitForSlot

		:: Mark started and launch the worker in the background.
		echo. > "%run_dir%\!job_id!.started"
		START "" /B cmd /c ""%~f0" --worker "!job_id!" "%run_dir%" "!file_path!" "%search_dir%""

		:: Flush any logs that have completed so far.
		CALL :drainCompleted
	)
)

:: Wait for all in-flight jobs to finish (also drains as they complete).
CALL :waitAll
CALL :drainCompleted

:: Cleanup scratch.
rmdir /S /Q "%run_dir%" >NUL 2>&1

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
		echo ================================
		IF /I %0 EQU "%~dpnx0" PAUSE
		exit /B 1
	)
	echo ================================
)
exit /B 0


:::::::::::::::::::::::::
:: Throttling helpers ::
:::::::::::::::::::::::::

:waitForSlot
	CALL :drainCompleted
	SET /A _running=0
	FOR %%F IN ("%run_dir%\*.started") DO (
		IF NOT EXIST "%run_dir%\%%~nF.done" SET /A _running+=1
	)
	IF !_running! GEQ !MAX_PARALLEL! (
		>NUL timeout /t 1 /nobreak
		GOTO waitForSlot
	)
exit /B 0

:waitAll
	CALL :drainCompleted
	SET /A _running=0
	FOR %%F IN ("%run_dir%\*.started") DO (
		IF NOT EXIST "%run_dir%\%%~nF.done" SET /A _running+=1
	)
	IF !_running! GTR 0 (
		>NUL timeout /t 1 /nobreak
		GOTO waitAll
	)
exit /B 0

:drainCompleted
	:: Print logs for any jobs that have finished since the last drain.
	:: Output is in completion order; each log starts with its #N header so it's easy to follow.
	FOR %%F IN ("%run_dir%\*.done") DO (
		IF NOT EXIST "%run_dir%\%%~nF.printed" (
			IF EXIST "%run_dir%\%%~nF.log" type "%run_dir%\%%~nF.log"
			IF EXIST "%run_dir%\%%~nF.err" SET /A export_error_count+=1
			echo. > "%run_dir%\%%~nF.printed"
		)
	)
exit /B 0


::::::::::::::::::::::::::::::::::::::
:: Worker: process a single .spine ::
::::::::::::::::::::::::::::::::::::::

:workerMain
	SETLOCAL enabledelayedexpansion
	SET "job_id=%~1"
	SET "run_dir=%~2"
	SET "file_path=%~3"
	SET "search_dir=%~4"
	SET "log_file=%run_dir%\%job_id%.log"

	:: All output for this job goes to its own log so console isn't scrambled.
	CALL :processSpineFile "!file_path!" "!search_dir!" "!job_id!" > "!log_file!" 2>&1
	SET "rc=!ERRORLEVEL!"

	IF NOT "!rc!"=="0" echo. > "%run_dir%\%job_id%.err"
	echo. > "%run_dir%\%job_id%.done"
	ENDLOCAL
exit /B 0

:processSpineFile
	SET "file_path=%~1"
	SET "search_dir=%~2"
	SET "job_id=%~3"
	SET "local_error=0"

	SET "relative_path=!file_path:%search_dir%\=!"

	echo ================================
	echo #!job_id! : !relative_path!

	:: Set parent_path to the .spine file's parent folder (no trailing backslash).
	FOR %%A IN ("!file_path!") DO SET "parent_path=%%~dpA"
	SET "parent_path=!parent_path:~0,-1!"

	:: Find .export.json files in same folder.
	SET json_files_count=0
	FOR %%D IN ("!parent_path!\"*.export.json) DO (
		CALL SET json_files[!json_files_count!]=%%D
		SET /A json_files_count+=1
	)

	IF !json_files_count! GEQ 2 (
		echo Multiple '.export.json' files were found:
		SET "json_file_count=!json_files_count!"
		SET export_count=0

		FOR /L %%E IN (0, 1, !json_files_count!) DO (
			SET "json_file=!json_files[%%E]!"
			IF DEFINED json_file (
				FOR /F %%F IN ("!json_file!") DO (
					CALL :isValidExportJson isValidJson "!json_file!"
					IF !isValidJson!==true (
						echo ================================
						SET /A export_count+=1
						SET "relative_json_path=!json_file:%search_dir%\=!"
						echo !export_count!/!json_file_count! Exporting with the export settings JSON file: !relative_json_path!
						CALL :exportUsingJsonSettings "!json_file!" "!file_path!" || SET local_error=1
					) ELSE (
						echo The '.export.json' file does not appear to be export settings JSON. This file will be skipped.
					)
				)
			)
		)
	) ELSE IF !json_files_count! EQU 1 (
		SET "json_file=!json_files[0]!"
		FOR /F %%K IN ("!json_file!") DO (
			CALL :isValidExportJson isValidJson "!json_file!"
			IF !isValidJson!==true (
				SET "relative_json_path=!json_file:%search_dir%\=!"
				echo Exporting with the export settings JSON file: !relative_json_path!
				CALL :exportUsingJsonSettings "!json_file!" "!file_path!" || SET local_error=1
			) ELSE (
				echo The '.export.json' file does not appear to be export settings JSON. Default settings ^(!DEFAULT_EXPORT!^) will be used for export.
				CALL :exportUsingDefaultSettings "!parent_path!" "!file_path!" || SET local_error=1
			)
		)
	) ELSE (
		echo No '.export.json' files were found in the same folder as the Spine project. Default settings ^(!DEFAULT_EXPORT!^) will be used for export.
		CALL :exportUsingDefaultSettings "!parent_path!" "!file_path!" || SET local_error=1
	)

exit /B !local_error!


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

	echo ^>^> "!SPINE_EXE!" -Xmx%MAX_MEMORY% --update %VERSION% --input "!file_path!" !CLEANUP_FLAG! --export "!json_file!"
	"!SPINE_EXE!" -Xmx%MAX_MEMORY% --update %VERSION% --input "!file_path!" !CLEANUP_FLAG! --export "!json_file!"
	IF !ERRORLEVEL!==0 (
		echo Exported to the following folder: !output_path!
		exit /B 0
	) ELSE (
		FOR %%A IN ("!file_path!") DO SET "parent_path=%%~dpA"
		SET output_path="!parent_path!%DEFAULT_OUTPUT_DIR%"
		echo Export failed. Exporting to default output folder !output_path!.

		echo ^>^> "!SPINE_EXE!" -Xmx%MAX_MEMORY% --update %VERSION% --input "!file_path!" !CLEANUP_FLAG! --output "!output_path!" --export "!json_file!"
		"!SPINE_EXE!" -Xmx%MAX_MEMORY% --update %VERSION% --input "!file_path!" !CLEANUP_FLAG! --output "!output_path!" --export "!json_file!"
		IF !ERRORLEVEL!==0 (
			echo Exported to the following folder: !output_path!
			exit /B 0
		) ELSE (
			echo Export to default output folder failed.
			exit /B 1
		)
	)
exit /B 0

:exportUsingDefaultSettings
	SET "parent_path=%~1"
	SET "file_path=%~2"

	echo Exporting with default settings.

	:: Add the --clean option if CLEANUP is set to "true".
	SET CLEANUP_FLAG=
	IF "%CLEANUP%"=="true" (
		SET CLEANUP_FLAG="--clean"
	)

	echo ^>^> "!SPINE_EXE!" -Xmx%MAX_MEMORY% --update %VERSION% --input "!file_path!" !CLEANUP_FLAG! --output "!parent_path!\export" --export !DEFAULT_EXPORT!
	"!SPINE_EXE!" -Xmx%MAX_MEMORY% --update %VERSION% --input "!file_path!" !CLEANUP_FLAG! --output "!parent_path!\export" --export !DEFAULT_EXPORT!
	IF !ERRORLEVEL!==0 (
		echo Exported to the following folder: !parent_path!
		exit /B 0
	) ELSE (
		echo Export failed.
		exit /B 1
	)
exit /B 0
