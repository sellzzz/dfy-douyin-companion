param([switch]$SkipModelPull,[switch]$NoShortcut)
$ErrorActionPreference='Stop'
if($PSVersionTable.PSVersion.Major -lt 7){throw '请使用 PowerShell 7：pwsh -File scripts/setup.ps1'}
if([Environment]::OSVersion.Platform -ne 'Win32NT' -or ![Environment]::Is64BitOperatingSystem){throw '当前仅支持 Windows x64。'}
$repoRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nodeExe=(Get-Command node.exe -ErrorAction Stop).Source
$nodeVersion=[version]((& $nodeExe --version).TrimStart('v'))
if($nodeVersion -lt [version]'22.12.0'){throw '需要 Node.js 22.12 或更新版本。'}
$npmExe=(Get-Command npm.cmd -ErrorAction Stop).Source
$ollamaExe=(Get-Command ollama.exe -ErrorAction Stop).Source
function Run-Checked([string]$exe,[string[]]$arguments){& $exe @arguments;if($LASTEXITCODE -ne 0){throw "安装步骤失败：$exe，退出码 $LASTEXITCODE"}}
Push-Location $repoRoot
try{
 Run-Checked $npmExe @('ci')
 $runtimeDir=Join-Path $repoRoot 'work/runtime'
 New-Item -ItemType Directory -Force $runtimeDir,(Join-Path $repoRoot 'work/dsh-home/dsh-pet') | Out-Null
 Copy-Item -LiteralPath (Join-Path $repoRoot 'runtime/package.json') -Destination (Join-Path $runtimeDir 'package.json')
 Copy-Item -LiteralPath (Join-Path $repoRoot 'runtime/package-lock.json') -Destination (Join-Path $runtimeDir 'package-lock.json')
 Run-Checked $npmExe @('ci','--prefix',$runtimeDir,'--legacy-peer-deps')
 $env:DSH_HOME=Join-Path $repoRoot 'work/dsh-home'
 Run-Checked $nodeExe @((Join-Path $PSScriptRoot 'apply-close-button.mjs'))
 Run-Checked $nodeExe @((Join-Path $PSScriptRoot 'apply-drag-start.mjs'))
 Run-Checked $nodeExe @((Join-Path $PSScriptRoot 'apply-region-roaming.mjs'))
 Run-Checked $nodeExe @((Join-Path $runtimeDir 'node_modules/dsh-pet/scripts/ensure-electron.mjs'))
 $configPath=Join-Path $env:DSH_HOME 'dsh-pet/main-config.jsonc'
 if(!(Test-Path $configPath)){
  @{pets=@(@{id='main';name='大肥鱼';size=462;balanceEnabled=$false;whisperEnabled=$false;workStatusEnabled=$false;fixedEnabled=$true;display='desktop';position=@{corner='top-right';marginX=24;marginY=100}})} | ConvertTo-Json -Depth 10 | Set-Content $configPath -Encoding utf8
 }
 Run-Checked $npmExe @('test')
 Run-Checked $npmExe @('run','check')
 if(!$SkipModelPull){
  try {Invoke-RestMethod http://127.0.0.1:11434/api/version -TimeoutSec 2 | Out-Null} catch {
   Start-Process $ollamaExe -ArgumentList 'serve' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $repoRoot 'work/ollama.stdout.log') -RedirectStandardError (Join-Path $repoRoot 'work/ollama.stderr.log')
   for($attempt=0;$attempt -lt 20;$attempt++){try{Invoke-RestMethod http://127.0.0.1:11434/api/version -TimeoutSec 1 | Out-Null;break}catch{Start-Sleep -Milliseconds 500}}
  }
  Run-Checked $ollamaExe @('pull','qwen3-vl:2b-instruct-q4_K_M')
 }
 if(!$NoShortcut){
  $shell=New-Object -ComObject WScript.Shell
  $shortcut=$shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'dfy-抖音陪看.lnk'))
  $shortcut.TargetPath=(Get-Command pwsh.exe).Source
  $shortcut.Arguments='-NoProfile -WindowStyle Hidden -File "'+(Join-Path $PSScriptRoot 'start-doupet.ps1')+'"'
  $shortcut.WorkingDirectory=$repoRoot
  $shortcut.Description='把桌宠拖到抖音视频上，松手开始陪看'
  $shortcut.IconLocation=(Join-Path $env:DSH_HOME 'electron/electron.exe')+',0'
  $shortcut.Save()
 }
 Write-Host '安装完成。使用桌面“dfy-抖音陪看”，或 pwsh -File scripts/start-doupet.ps1 启动。'
}finally{Pop-Location}
