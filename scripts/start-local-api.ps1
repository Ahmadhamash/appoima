$ErrorActionPreference = 'Stop'
# Local secrets are Windows-user-encrypted and excluded from version control.
$secretPath = Join-Path $PSScriptRoot '../.local/api-secrets.json'
if (!(Test-Path -LiteralPath $secretPath)) { throw 'Local API credentials have not been configured.' }
$stored = Get-Content -LiteralPath $secretPath -Raw | ConvertFrom-Json
function Read-ProtectedValue([string]$value) {
  $secure = ConvertTo-SecureString $value
  return [System.Net.NetworkCredential]::new('', $secure).Password
}
$env:JORMALL_OPENAI_API_KEY = Read-ProtectedValue $stored.openaiKey
$env:OPENAI_API_KEY = $env:JORMALL_OPENAI_API_KEY
$env:SONIOX_API_KEY = if ($stored.sonioxKey) { Read-ProtectedValue $stored.sonioxKey } else { '' }
$env:OPENAI_BASE_URL = 'https://api.openai.com/v1'
$env:SESSION_SECRET = Read-ProtectedValue $stored.sessionSecret
$env:DATABASE_URL = 'postgresql://jormall_dev@127.0.0.1:55432/jormall_dev'
$env:PORT = '5000'
$env:CONCIERGE_DAILY_LIMITS_ENABLED = 'false'
$apiDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../artifacts/api-server'))
if (Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 5000 is already in use. Stop the known API process before restarting.' }
$process = Start-Process -FilePath (Get-Command node).Source -ArgumentList '--enable-source-maps','./dist/index.mjs' -WorkingDirectory $apiDirectory -WindowStyle Hidden -PassThru
[pscustomobject]@{ ApiPid = $process.Id; Port = 5000; Credentials = 'Protected local application configuration' }
