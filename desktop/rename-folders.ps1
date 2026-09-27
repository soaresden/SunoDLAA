# =====================================================================
#  SUNODLAA - rename existing Suno workspace folders to your format
#  e.g. "Suno -Lucie" -> "Suno - Lucie". Shows the list first, asks
#  before touching anything, never overwrites an existing folder.
#  Library folder and format come from config.json (SunoAAWeb settings).
# =====================================================================
param([string]$Path)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfgFile = Join-Path $Root 'config.json'
$cfg = $null
if (Test-Path $cfgFile) { try { $cfg = Get-Content $cfgFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch {} }

$pattern = 'Suno - {workspace}'
if ($cfg -and $cfg.folderPattern) { $pattern = $cfg.folderPattern }
if (-not $Path -and $cfg -and $cfg.libraryPath) { $Path = $cfg.libraryPath }

Write-Host ''
Write-Host '  SUNODLAA - rename Suno workspace folders' -ForegroundColor Cyan
Write-Host ''
$answer = Read-Host "  Music folder [$Path]"
if ($answer) { $Path = $answer.Trim('"', ' ') }
if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { Write-Host "  [X] Folder not found: $Path" -ForegroundColor Red; exit 1 }
Write-Host "  Format: $pattern"
Write-Host ''

function Clean($s) { return ($s -replace '[\\/:*?"<>|]', '_').Trim() }
function Target($ws) {
    $w = Clean $ws
    $out = $pattern -replace '\{workspace\}', $w
    return ($out -replace '(?i)<\s*(workspace|album)\s*>', $w)
}

$rx = '^\s*suno\s*[-\u2013\u2014]\s*'
$dirs = @(Get-ChildItem -LiteralPath $Path -Directory)
$taken = @{}; foreach ($d in $dirs) { $taken[$d.Name.ToLower()] = $true }
$todo = @(); $conflicts = @()
foreach ($d in $dirs) {
    if ($d.Name -notmatch $rx) { continue }
    $ws = ($d.Name -replace $rx, '').Trim()
    if (-not $ws) { continue }
    $to = Target $ws
    if ($to -ceq $d.Name) { continue }
    if ($to.ToLower() -ne $d.Name.ToLower() -and $taken.ContainsKey($to.ToLower())) { $conflicts += "$($d.Name)  ->  $to"; continue }
    $todo += [pscustomobject]@{ From = $d.Name; To = $to }
}

if ($todo.Count -eq 0) {
    Write-Host '  Nothing to rename: every workspace folder already matches the format.' -ForegroundColor Green
    if ($conflicts.Count) { Write-Host "  ($($conflicts.Count) skipped because the new name already exists)" }
    exit 0
}
foreach ($t in $todo) { Write-Host ("    {0}  ->  {1}" -f $t.From, $t.To) }
Write-Host ''
Write-Host "  $($todo.Count) folder(s) to rename." -ForegroundColor Yellow
if ($conflicts.Count) {
    Write-Host "  $($conflicts.Count) skipped, the new name already exists:" -ForegroundColor DarkYellow
    $conflicts | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkYellow }
}
Write-Host ''
$ok = Read-Host '  Rename them now? (Y/N)'
if ($ok -notmatch '^(y|yes|o|oui)$') { Write-Host '  Cancelled, nothing changed.'; exit 0 }

$done = 0; $failed = 0
foreach ($t in $todo) {
    try {
        $src = Join-Path $Path $t.From
        if ($t.To.ToLower() -eq $t.From.ToLower()) {
            $tmp = $t.From + '.~sunodlaa'
            Rename-Item -LiteralPath $src -NewName $tmp
            Rename-Item -LiteralPath (Join-Path $Path $tmp) -NewName $t.To
        } else {
            Rename-Item -LiteralPath $src -NewName $t.To
        }
        $done++
    } catch {
        $failed++
        Write-Host "  [X] $($t.From): $($_.Exception.Message)" -ForegroundColor Red
    }
}
Write-Host ''
Write-Host "  Done: $done renamed, $failed failed, $($conflicts.Count) skipped." -ForegroundColor Green
Write-Host '  Next: "Sync folder" in the SUNODLAA phone app, and update MediaMonkey''s library.'
