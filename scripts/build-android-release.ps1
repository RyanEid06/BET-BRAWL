param([string]$JavaHome = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot')
$ErrorActionPreference = 'Stop'
if (git status --porcelain) { throw 'Build/sign a clean, committed checkout only.' }
$signingDirectory = Join-Path $env:USERPROFILE '.android\bet-brawl-release'
$credential = Import-Clixml -LiteralPath (Join-Path $signingDirectory 'credentials.xml')
$env:ANDROID_KEYSTORE_FILE = Join-Path $signingDirectory 'bet-brawl-release.p12'
$env:ANDROID_KEYSTORE_PASSWORD = $credential.GetNetworkCredential().Password
$env:ANDROID_KEY_ALIAS = $credential.UserName
$env:ANDROID_KEY_PASSWORD = $env:ANDROID_KEYSTORE_PASSWORD
$previousJava = $env:JAVA_HOME
$env:JAVA_HOME = $JavaHome
try {
    npm run build:android
    if ($LASTEXITCODE -ne 0) { throw 'Bundled UI build failed.' }
    & .\gradlew.bat :app:testDebugUnitTest :app:lintRelease :app:assembleRelease --no-daemon
    if ($LASTEXITCODE -ne 0) { throw 'Signed release verification/build failed.' }
} finally {
    foreach ($variable in @('ANDROID_KEYSTORE_FILE','ANDROID_KEYSTORE_PASSWORD','ANDROID_KEY_ALIAS','ANDROID_KEY_PASSWORD')) { Remove-Item "Env:$variable" -ErrorAction SilentlyContinue }
    $env:JAVA_HOME = $previousJava
}
