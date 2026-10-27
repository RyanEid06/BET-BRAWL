param(
    [Parameter(Mandatory = $true)][string]$Serial,
    [string]$AdbPath = 'adb',
    [string]$EvidenceDir = 'artifacts/android-startup-smoke'
)

$ErrorActionPreference = 'Stop'
if ($Serial -notmatch '^emulator-\d+$') { throw 'This smoke test only supports an explicitly selected emulator.' }
$devices = & $AdbPath devices
if ($LASTEXITCODE -ne 0 -or -not ($devices -match "^$Serial\s+device$")) { throw "Emulator $Serial is not ready." }
New-Item -ItemType Directory -Force $EvidenceDir | Out-Null

for ($attempt = 1; $attempt -le 3; $attempt++) {
    & $AdbPath -s $Serial shell am force-stop com.betbrawl.app
    if ($LASTEXITCODE -ne 0) { throw 'Could not stop the app for a cold launch.' }
    & $AdbPath -s $Serial shell am start -W -n com.betbrawl.app/.MainActivity |
        Set-Content (Join-Path $EvidenceDir "launch-$attempt.txt")
    if ($LASTEXITCODE -ne 0) { throw 'Activity launch failed.' }
    Start-Sleep -Seconds 10
    $appPid = & $AdbPath -s $Serial shell pidof com.betbrawl.app
    if ($LASTEXITCODE -ne 0 -or -not $appPid) {
        & $AdbPath -s $Serial logcat -b crash -d -v threadtime |
            Set-Content (Join-Path $EvidenceDir "crash-$attempt.txt")
        throw "App exited during cold launch $attempt; see crash-$attempt.txt."
    }
    & $AdbPath -s $Serial shell dumpsys activity activities |
        Set-Content (Join-Path $EvidenceDir "activities-$attempt.txt")
    $activities = Get-Content (Join-Path $EvidenceDir "activities-$attempt.txt") -Raw
    if ($activities -notmatch '(?:mResumedActivity:|topResumedActivity=|ResumedActivity:).*com\.betbrawl\.app/\.MainActivity') {
        & $AdbPath -s $Serial logcat -b crash -d -v threadtime |
            Set-Content (Join-Path $EvidenceDir "crash-$attempt.txt")
        throw "MainActivity is not resumed after cold launch $attempt."
    }
    & $AdbPath -s $Serial shell uiautomator dump /sdcard/brawl-startup-ui.xml | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the home screen.' }
    $ui = & $AdbPath -s $Serial shell cat /sdcard/brawl-startup-ui.xml
    $ui | Set-Content (Join-Path $EvidenceDir "home-$attempt.xml")
    if ($ui -notmatch '(?i)HOST NEW GAME') { throw "Home screen did not render after cold launch $attempt." }
    Write-Output "PASS cold launch $attempt (PID $appPid)"
}
