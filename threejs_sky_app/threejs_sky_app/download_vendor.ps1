# PowerShell script to create vendor folder and download Three.js + controls locally
# Usage:
#   cd threejs_sky_app_pack
#   powershell -ExecutionPolicy Bypass -File .\download_vendor.ps1
# Then edit OrbitControls.js and PointerLockControls.js to replace `from 'three'` with `from './three.module.js'` if needed.

$ErrorActionPreference = "Stop"

if (!(Test-Path ".\vendor")) { New-Item -ItemType Directory -Path ".\vendor" | Out-Null }

Write-Host "Downloading three.module.js ..."
curl.exe -L "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js" -o "vendor/three.module.js"

Write-Host "Downloading OrbitControls.js ..."
curl.exe -L "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js" -o "vendor/OrbitControls.js"

Write-Host "Downloading PointerLockControls.js ..."
curl.exe -L "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/PointerLockControls.js" -o "vendor/PointerLockControls.js"

Write-Host "Patching controls to use local three.module.js ..."
(Get-Content "vendor/OrbitControls.js") -replace "from 'three';", "from './three.module.js';" | Set-Content "vendor/OrbitControls.js"
(Get-Content "vendor/PointerLockControls.js") -replace "from 'three';", "from './three.module.js';" | Set-Content "vendor/PointerLockControls.js"

Write-Host "Done. You can now run: python server.py"
