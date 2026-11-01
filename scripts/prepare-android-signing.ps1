param(
    [switch]$Create,
    [switch]$UploadToGitHub,
    [string]$KeytoolPath = 'keytool',
    [string]$Repository = 'RyanEid06/BET-BRAWL'
)
$ErrorActionPreference = 'Stop'
$signingDirectory = Join-Path $env:USERPROFILE '.android\bet-brawl-release'
$storePath = Join-Path $signingDirectory 'bet-brawl-release.p12'
$credentialPath = Join-Path $signingDirectory 'credentials.xml'
$aliasName = 'betbrawl-release'
if ((Test-Path -LiteralPath $storePath) -ne (Test-Path -LiteralPath $credentialPath)) {
    throw 'Incomplete permanent signing store. Restore its matching protected credential; do not generate another identity.'
}
if (-not (Test-Path -LiteralPath $storePath)) {
    if (-not $Create) { throw 'No permanent release identity. Use -Create only when establishing the owner-authorized first release key.' }
    New-Item -ItemType Directory -Force -Path $signingDirectory | Out-Null
    $acl = Get-Acl -LiteralPath $signingDirectory
    $acl.SetAccessRuleProtection($true, $false)
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($owner, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.SetAccessRule($rule)
    Set-Acl -LiteralPath $signingDirectory -AclObject $acl
    $randomPassword = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
    $credential = [pscredential]::new($aliasName, (ConvertTo-SecureString $randomPassword -AsPlainText -Force))
    $credential | Export-Clixml -LiteralPath $credentialPath
    $env:BRAWL_SIGNING_PASSWORD = $randomPassword
    try {
        & $KeytoolPath -genkeypair -keystore $storePath -storetype PKCS12 -alias $aliasName -keyalg RSA -keysize 4096 -sigalg SHA256withRSA -validity 10000 -dname 'CN=BET & BRAWL Android Release' -storepass:env BRAWL_SIGNING_PASSWORD -keypass:env BRAWL_SIGNING_PASSWORD -noprompt
        if ($LASTEXITCODE -ne 0) { throw 'Release key generation failed. Preserve files for recovery; do not overwrite.' }
    } finally { Remove-Item Env:BRAWL_SIGNING_PASSWORD -ErrorAction SilentlyContinue; $randomPassword = $null }
}

$credential = Import-Clixml -LiteralPath $credentialPath
$signingPassword = $credential.GetNetworkCredential().Password
$env:BRAWL_SIGNING_PASSWORD = $signingPassword
try {
    $certificateInfo = & $KeytoolPath -list -v -keystore $storePath -alias $aliasName -storepass:env BRAWL_SIGNING_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw 'Permanent release identity could not be verified.' }
    $fingerprint = ($certificateInfo | Select-String 'SHA256:').ToString().Trim()
    if (-not $fingerprint) { throw 'Missing release certificate SHA-256.' }
    if ($UploadToGitHub) {
        # All secret values travel over stdin; never through argv, logs or a repository file.
        $secrets = @{
            ANDROID_KEYSTORE_BASE64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($storePath))
            ANDROID_KEYSTORE_PASSWORD = $signingPassword
            ANDROID_KEY_ALIAS = $aliasName
            ANDROID_KEY_PASSWORD = $signingPassword
        }
        foreach ($secretName in $secrets.Keys) {
            $start = [Diagnostics.ProcessStartInfo]::new((Get-Command gh).Source)
            $start.UseShellExecute = $false
            $start.RedirectStandardInput = $true
            $start.RedirectStandardOutput = $true
            $start.RedirectStandardError = $true
            foreach ($argument in @('secret', 'set', $secretName, '--repo', $Repository)) { $start.ArgumentList.Add($argument) }
            $process = [Diagnostics.Process]::Start($start)
            $process.StandardInput.Write($secrets[$secretName])
            $process.StandardInput.Close()
            $null = $process.StandardOutput.ReadToEnd()
            $null = $process.StandardError.ReadToEnd()
            $process.WaitForExit()
            if ($process.ExitCode -ne 0) { throw "Could not configure GitHub secret $secretName. No value was logged." }
            Write-Output "Configured $secretName"
        }
        $secrets.Clear()
    }
    Write-Output "Permanent release store: $storePath"
    Write-Output "Protected local credential: $credentialPath (Windows current-user DPAPI)"
    Write-Output "Alias: $aliasName"
    Write-Output $fingerprint
} finally { Remove-Item Env:BRAWL_SIGNING_PASSWORD -ErrorAction SilentlyContinue; $signingPassword = $null }
