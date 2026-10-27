@echo off
rem flagqai: launch FlagQAI through the official dsh CLI profile boot.
rem Equivalent to: dsh --profile flagqai <args>
rem   --resume: read ~/.flagqai/resume.txt and feed it to the TUI as
rem             FLAGQAI_RESUME_SESSION (the TUI writes the chosen session id
rem             there on /resume; see src/sessionHistory.ts).
rem Prereq: dsh CLI on PATH (npm install -g @deepseek-ai/dsh). The profile
rem         is created by `dsh plugin --profile flagqai add @flagqai/cli`
rem         under $DSH_HOME/profiles/flagqai (default ~/.dsh), so this
rem         launcher must NOT pin DSH_HOME.
rem NODE_ENV defaults to production: the React renderer's development build
rem records unbounded performance.measure() entries and OOMs long sessions.
rem WORKSPACE: 工作目录（默认当前目录；可用 FLAGQAI_WORKSPACE 环境变量覆盖）。
setlocal
if not defined NODE_ENV set "NODE_ENV=production"
set "WORKSPACE=%FLAGQAI_WORKSPACE%"
if "%WORKSPACE%"=="" set "WORKSPACE=%CD%"
cd /d "%WORKSPACE%"

where dsh >nul 2>nul
if errorlevel 1 (
  echo [flagqai] 未找到 dsh CLI。请先安装：npm install -g @deepseek-ai/dsh 1>&2
  exit /b 1
)

set "ARGS="
:parse
if "%~1"=="" goto :run
if /i "%~1"=="--resume" (
  if exist "%USERPROFILE%\.flagqai\resume.txt" (
    set /p FLAGQAI_RESUME_SESSION=<"%USERPROFILE%\.flagqai\resume.txt"
  )
) else (
  set "ARGS=%ARGS% "%~1""
)
shift
goto :parse

:run
@dsh --profile flagqai %ARGS%
endlocal
