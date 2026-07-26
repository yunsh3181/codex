[CmdletBinding()]
param(
    [string]$ExecutablePath
)

$ErrorActionPreference = 'Stop'
$environmentName = 'PJ_KIOSK_FIREBASE_CUSTOM_TOKEN'
$secureToken = Read-Host 'Paste the Firebase Custom Token (input is hidden)' -AsSecureString
$tokenPointer = [IntPtr]::Zero
$plainToken = $null
$processStartInfo = $null

try {
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    if ([string]::IsNullOrWhiteSpace($plainToken)) {
        throw 'A non-empty Custom Token is required.'
    }

    if ([string]::IsNullOrWhiteSpace($ExecutablePath)) {
        $candidates = @(
            (Join-Path $env:LOCALAPPDATA 'Programs\PapaJohns-Kiosk\PapaJohns-Kiosk.exe'),
            (Join-Path $env:LOCALAPPDATA 'Programs\PapaJohns Kiosk\PapaJohns-Kiosk.exe')
        )
        $ExecutablePath = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
            Select-Object -First 1
    }
    if ([string]::IsNullOrWhiteSpace($ExecutablePath) -or
        -not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) {
        throw 'PapaJohns-Kiosk.exe was not found. Pass -ExecutablePath with the installed executable path.'
    }

    $resolvedExecutablePath = [IO.Path]::GetFullPath(
        (Resolve-Path -LiteralPath $ExecutablePath).Path
    )
    $processName = [IO.Path]::GetFileNameWithoutExtension($resolvedExecutablePath)
    $runningProcesses = @(Get-Process -Name $processName -ErrorAction SilentlyContinue)
    foreach ($runningProcess in $runningProcesses) {
        try {
            $runningPath = $runningProcess.Path
        }
        catch {
            throw 'A PapaJohns Kiosk process is running, but its path cannot be verified. Fully exit the kiosk application and run this bootstrap script again.'
        }
        if ([string]::IsNullOrWhiteSpace($runningPath)) {
            throw 'A PapaJohns Kiosk process is running, but its path cannot be verified. Fully exit the kiosk application and run this bootstrap script again.'
        }
        $resolvedRunningPath = [IO.Path]::GetFullPath($runningPath)
        if ([string]::Equals(
            $resolvedRunningPath,
            $resolvedExecutablePath,
            [StringComparison]::OrdinalIgnoreCase
        )) {
            throw 'PapaJohns Kiosk is already running. Fully exit the kiosk application and run this bootstrap script again.'
        }
    }

    $processStartInfo = New-Object System.Diagnostics.ProcessStartInfo
    $processStartInfo.FileName = $resolvedExecutablePath
    $processStartInfo.UseShellExecute = $false
    $processStartInfo.WorkingDirectory = [IO.Path]::GetDirectoryName($resolvedExecutablePath)
    $processStartInfo.EnvironmentVariables[$environmentName] = $plainToken
    $process = [System.Diagnostics.Process]::Start($processStartInfo)
    if ($null -eq $process) {
        throw 'PapaJohns Kiosk could not be started.'
    }
    [void]$processStartInfo.EnvironmentVariables.Remove($environmentName)
    $plainToken = $null
    Write-Host "PapaJohns Kiosk started (process $($process.Id))."
}
finally {
    if ($null -ne $processStartInfo) {
        [void]$processStartInfo.EnvironmentVariables.Remove($environmentName)
    }
    $plainToken = $null
    if ($tokenPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }
}

Write-Host 'The temporary child process credential has been removed from bootstrap memory.'
Write-Host 'Confirm authentication-complete, channel-created, presence-write-success, heartbeat-started, and connected in diagnostics.'
Write-Host 'Then fully exit and restart the kiosk without this script to verify Firebase Auth persistence.'
