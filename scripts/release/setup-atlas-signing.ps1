# Atlas release signing: local key ownership; no Android SDK/JDK installation required.
param(
  [string]$Repository = 'coolchan03/Atlas',
  [string]$OutputDirectory = (Join-Path $HOME 'Atlas-Signing'),
  [string]$Alias = 'atlas-upload'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw 'GitHub CLI (gh) is required. Install it and run gh auth login.'
}
& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not signed in.' }
$openssl = (Get-Command openssl -ErrorAction SilentlyContinue)
if (-not $openssl) {
  foreach ($candidate in @('C:\Program Files\Git\mingw64\bin\openssl.exe', 'C:\Program Files\Git\usr\bin\openssl.exe')) {
    if (Test-Path -LiteralPath $candidate) { $openssl = $candidate; break }
  }
}
$keytool = Get-Command keytool -ErrorAction SilentlyContinue
if (-not $openssl -and -not $keytool) {
  throw 'Git for Windows OpenSSL or JDK keytool is required to create a signing key. No Android SDK is needed.'
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$keyPath = Join-Path $OutputDirectory 'atlas-upload-keystore.p12'
$existing = Test-Path -LiteralPath $keyPath
if ($existing) {
  Write-Host "Reusing the existing release keystore: $keyPath"
} else {
  Write-Host 'A new permanent signing key will be created. Back up the file and password securely.'
}
$secret = Read-Host 'Enter your permanent signing password (12+ ASCII characters)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ($password -cnotmatch '^[\x21-\x7e]{12,}$') {
  throw 'Use at least 12 printable ASCII characters, without whitespace.'
}
$env:ATLAS_KEY_PASSWORD = $password
$private = Join-Path $OutputDirectory ('atlas-temporary-' + [guid]::NewGuid().ToString('N') + '.key')
$cert = Join-Path $OutputDirectory ('atlas-temporary-' + [guid]::NewGuid().ToString('N') + '.crt')
try {
  if (-not $existing) {
    if ($openssl) {
      & $openssl genpkey -algorithm RSA -aes-256-cbc -pass env:ATLAS_KEY_PASSWORD -pkeyopt rsa_keygen_bits:4096 -out $private
      if ($LASTEXITCODE -ne 0) { throw 'OpenSSL key generation failed.' }
      & $openssl req -new -x509 -key $private -passin env:ATLAS_KEY_PASSWORD -out $cert -days 10000 -subj '/CN=Atlas Release/O=Atlas/C=US'
      if ($LASTEXITCODE -ne 0) { throw 'OpenSSL certificate generation failed.' }
      & $openssl pkcs12 -export -inkey $private -passin env:ATLAS_KEY_PASSWORD -in $cert -out $keyPath -name $Alias -passout env:ATLAS_KEY_PASSWORD
      if ($LASTEXITCODE -ne 0) { throw 'OpenSSL PKCS12 export failed.' }
    } else {
      & keytool -genkeypair -keystore $keyPath -storetype PKCS12 -keyalg RSA -keysize 4096 -validity 10000 -alias $Alias -dname 'CN=Atlas Release,O=Atlas,C=US' -storepass:env ATLAS_KEY_PASSWORD -keypass:env ATLAS_KEY_PASSWORD
      if ($LASTEXITCODE -ne 0) { throw 'Keytool key generation failed.' }
    }
  }
  if ($openssl) {
    & $openssl pkcs12 -in $keyPath -passin env:ATLAS_KEY_PASSWORD -noout
  } else {
    & keytool -list -keystore $keyPath -storetype PKCS12 -storepass:env ATLAS_KEY_PASSWORD -alias $Alias
  }
  if ($LASTEXITCODE -ne 0) { throw 'Cannot open the signing keystore with that password.' }
  function Set-AtlasSecret([string]$Name, [string]$Value) {
    $Value | & gh secret set $Name -R $Repository
    if ($LASTEXITCODE -ne 0) { throw "Failed to configure GitHub secret $Name" }
    Write-Host "Configured $Name"
  }
  $encoded = [Convert]::ToBase64String([IO.File]::ReadAllBytes($keyPath))
  Set-AtlasSecret 'OFFGRID_UPLOAD_KEYSTORE_BASE64' $encoded
  Set-AtlasSecret 'OFFGRID_UPLOAD_STORE_PASSWORD' $password
  Set-AtlasSecret 'OFFGRID_UPLOAD_KEY_ALIAS' $Alias
  Set-AtlasSecret 'OFFGRID_UPLOAD_KEY_PASSWORD' $password
  Write-Host 'Your permanent release-signing credentials are configured.'
  Write-Host "Keystore: $keyPath"
  Write-Host 'Store your password in a password manager and make an OFFLINE backup of the keystore.'
  & gh secret list -R $Repository
} finally {
  Remove-Item -LiteralPath $private, $cert -Force -ErrorAction SilentlyContinue
  Remove-Item Env:ATLAS_KEY_PASSWORD -ErrorAction SilentlyContinue
  $password = $null
  $encoded = $null
  $secret.Dispose()
}
