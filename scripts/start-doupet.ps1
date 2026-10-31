$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$env:DSH_HOME=Join-Path $taskRoot 'work/dsh-home'
$nodePath=(Get-Command node.exe).Source
& $nodePath (Join-Path $PSScriptRoot 'apply-close-button.mjs') | Out-Null
& $nodePath (Join-Path $PSScriptRoot 'apply-drag-start.mjs') | Out-Null
foreach($runtimePart in @('main.js','preload.js','sprite.js')){
 & $nodePath --check (Join-Path $taskRoot ('work/runtime/node_modules/dsh-pet/runtime/electron-helper/'+$runtimePart))
 if($LASTEXITCODE -ne 0){throw '桌宠文件检查未通过，未启动。'}
}
try {Invoke-RestMethod http://127.0.0.1:11434/api/version -TimeoutSec 2 | Out-Null} catch {
 Start-Process (Get-Command ollama.exe).Source -ArgumentList 'serve' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskRoot 'work/ollama.stdout.log') -RedirectStandardError (Join-Path $taskRoot 'work/ollama.stderr.log')
}
$configFile=Join-Path $env:DSH_HOME 'dsh-pet/main-config.jsonc'
if(Test-Path $configFile){
 $backupFile=Join-Path $env:DSH_HOME 'dsh-pet/main-config.before-drag.jsonc'
 if(!(Test-Path $backupFile)){Copy-Item -LiteralPath $configFile -Destination $backupFile}
 $config=Get-Content $configFile -Raw | ConvertFrom-Json
 foreach($petItem in $config.pets){if($petItem.id -eq 'main'){$petItem.display='desktop';$petItem.fixedEnabled=$true;$petItem.whisperEnabled=$false;$petItem.balanceEnabled=$false;$petItem.workStatusEnabled=$false}}
 $config | ConvertTo-Json -Depth 40 | Set-Content -LiteralPath $configFile -Encoding utf8
}
$alive=$false
try {Invoke-RestMethod http://127.0.0.1:3081/health -TimeoutSec 2 | Out-Null;$alive=$true} catch {}
if($alive -and !(Test-Path (Join-Path $env:DSH_HOME 'dsh-pet/standalone-runtime.json'))){
 throw '端口 3081 已被另一份桌宠占用。请先退出另一份 dfy/DouPet，再启动本目录的版本。'
}
if(!$alive){
 $petEntry=Join-Path $taskRoot 'work/runtime/node_modules/dsh-pet/lib/standalone.js'
 Start-Process $nodePath -ArgumentList @(('"'+$petEntry+'"'),'--port','3081') -WindowStyle Hidden -WorkingDirectory $taskRoot -RedirectStandardOutput (Join-Path $taskRoot 'work/pet.stdout.log') -RedirectStandardError (Join-Path $taskRoot 'work/pet.stderr.log')
}
for($attempt=0;$attempt -lt 20;$attempt++){
 try {Invoke-RestMethod http://127.0.0.1:3081/health -TimeoutSec 1 | Out-Null;break} catch {Start-Sleep -Milliseconds 300}
}
$runtimeFile=Join-Path $env:DSH_HOME 'dsh-pet/standalone-runtime.json'
$runtimeInfo=Get-Content $runtimeFile -Raw | ConvertFrom-Json
Invoke-RestMethod 'http://127.0.0.1:3081/dsh-pet-7340/reload' -Method Post -Headers @{'x-dsh-pet-token'=$runtimeInfo.token} | Out-Null
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$controllerEntry=Join-Path $taskRoot 'app'
$controllerReady=$false
$controllerFile=Join-Path $env:DSH_HOME 'doupet/controller.json'
if(Test-Path $controllerFile){
 try {
  $controllerInfo=Get-Content $controllerFile -Raw | ConvertFrom-Json
  Invoke-RestMethod 'http://127.0.0.1:3082/stop' -Method Post -Headers @{'x-doupet-token'=$controllerInfo.token} -ContentType application/json -Body '{}' -TimeoutSec 2 | Out-Null
  $controllerReady=$true
 }catch{}
}
if(!$controllerReady){
 Start-Process (Join-Path $taskRoot 'work/dsh-home/electron/electron.exe') -ArgumentList @(('"'+$controllerEntry+'"'),'--drag-only') -WindowStyle Hidden -WorkingDirectory $taskRoot -RedirectStandardOutput (Join-Path $taskRoot 'work/window-companion.stdout.log') -RedirectStandardError (Join-Path $taskRoot 'work/window-companion.stderr.log')
}
Write-Host 'DouPet 已启动。把桌宠拖到正在播放的抖音画面上，松手即可陪看。'
