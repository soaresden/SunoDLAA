# =====================================================================
#  Suno Web Downloader - serveur local (PowerShell + TagLib-Sharp)
#  Sert l'interface web, fait proxy vers l'API Suno (auth Clerk),
#  telecharge les MP3 et ecrit les tags ID3 (TSRC = id Suno, pochette...).
#  Lance par Lancer.bat. Ne necessite aucune installation.
# =====================================================================
$ErrorActionPreference = 'Stop'
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Web

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

# ---- Log (desktop\logs\sunoaaweb.log) + cache (desktop\cache) ------------
$LogDir = Join-Path $Root 'logs';  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$CacheDir = Join-Path $Root 'cache'; New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null
$LogFile = Join-Path $LogDir 'sunoaaweb.log'
$IndexPath = Join-Path $CacheDir 'local-index.json'
$LibraryCachePath = Join-Path $CacheDir 'library.json'
function Log($level, $msg) {
    try {
        if ((Test-Path -LiteralPath $LogFile) -and (Get-Item -LiteralPath $LogFile).Length -gt 5MB) { Move-Item -Force -LiteralPath $LogFile -Destination ($LogFile + '.1') }
        $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'), $level, $msg
        [IO.File]::AppendAllText($LogFile, $line + "`r`n", (New-Object Text.UTF8Encoding($false)))
    } catch {}
}
Log 'INFO' "==== SunoAAWeb start - PowerShell $($PSVersionTable.PSVersion) - $([Environment]::OSVersion.VersionString)"

# ---- Config ---------------------------------------------------------
$ConfigPath = Join-Path $Root 'config.json'
function Load-Config {
    if (Test-Path $ConfigPath) {
        try { return Get-Content $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch {}
    }
    return [pscustomobject]@{
        port          = 8787
        libraryPath   = ''
        clientCookie  = ''      # cookie __client de suno.com (F12 > Application > Cookies)
        deviceId      = [guid]::NewGuid().ToString()
        apiBase       = 'https://studio-api.prod.suno.com'
        clerkBase     = 'https://auth.suno.com'
        folderPattern = 'Suno - {workspace}'   # {workspace} = nom du workspace
    }
}
function Save-Config($cfg) { $cfg | ConvertTo-Json -Depth 5 | Set-Content $ConfigPath -Encoding UTF8 }
$Cfg = Load-Config
# Remplit toute cle manquante (config.json partiel) avec sa valeur par defaut.
$defaults = @{
    port=8787; libraryPath=''; clientCookie='';
    deviceId=[guid]::NewGuid().ToString(); apiBase='https://studio-api.prod.suno.com';
    clerkBase='https://auth.suno.com'; folderPattern='Suno - {workspace}'; language='en'
    fileNamePattern='<Disc#:2>-<Track#:3> <Title>'; audioFormat='mp3'
    saveLrc=$true; downloadDelaySec=3
}
$changed = $false
foreach ($k in $defaults.Keys) {
    if (-not ($Cfg.PSObject.Properties.Name -contains $k) -or $null -eq $Cfg.$k -or $Cfg.$k -eq '') {
        if ($k -in @('clientCookie', 'libraryPath')) { if (-not ($Cfg.PSObject.Properties.Name -contains $k)) { $Cfg | Add-Member -NotePropertyName $k -NotePropertyValue '' -Force; $changed=$true }; continue }
        $Cfg | Add-Member -NotePropertyName $k -NotePropertyValue $defaults[$k] -Force; $changed = $true
    }
}
if ($changed) { Save-Config $Cfg }

function Folder-Name($workspace) {
    $ws = Sanitize $workspace
    $pat = $Cfg.folderPattern
    if (-not $pat) { $pat = 'Suno - {workspace}' }
    # {workspace} ou <Workspace>/<Album> ; on n'assainit que le nom du workspace, pas le motif
    $out = $pat -replace '\{workspace\}', $ws
    return ($out -replace '(?i)<\s*(workspace|album)\s*>', $ws)
}

# Nom de fichier facon masque MediaMonkey. Balises (anglais ou francais, casse libre) :
#   <Disc#> <Disque n>   -> 01      <Track#> <Piste n>  -> 054   (":N" pour choisir le nombre de chiffres)
#   <Title> <Titre>  <Artist> <Artiste>  <Album> <Workspace>  <Year> <Annee>  <Genre>  <ID> <ID8>
function File-Name($m) {
    $pat = $Cfg.fileNamePattern
    if (-not $pat) { $pat = '<Disc#:2>-<Track#:3> <Title>' }
    $eval = {
        param($mt)
        $k = ($mt.Groups[1].Value.ToLower() -replace '[^a-z0-9#]', '')
        $w = $mt.Groups[2].Value
        switch -Regex ($k) {
            '^(disc#|disc|discnumber|disquen|disque|cd)$'  { $d = 2; if ($w) { $d = [int]$w }; return ([string][int]$m.disc).PadLeft($d, '0') }
            '^(track#|track|tracknumber|pisten|piste|no)$' { $d = 3; if ($w) { $d = [int]$w }; return ([string][int]$m.track).PadLeft($d, '0') }
            '^(title|titre)$'           { return [string]$m.title }
            '^(artist|artiste)$'        { return [string]$m.artist }
            '^(album|workspace)$'       { return [string]$m.workspace }
            '^(year|annee|anne|date)$'  { return [string]$m.year }
            '^(genre|style)$'           { return [string]$m.genre }
            '^(id|isrc)$'               { return [string]$m.id }
            '^id8$'                     { $i = [string]$m.id; return $i.Substring(0, [Math]::Min(8, $i.Length)) }
            default                     { return $mt.Value }
        }
    }.GetNewClosure()
    $name = [regex]::Replace($pat, '<\s*([^<>:]+?)\s*(?::(\d+))?\s*>', [System.Text.RegularExpressions.MatchEvaluator]$eval)
    $name = ($name -replace '[\\/:*?"<>|]', '_').Trim().TrimEnd('.')
    if (-not $name) { $name = 'Untitled' }
    return $name
}
function File-Example {
    $ext = if ($Cfg.audioFormat -eq 'wav') { 'wav' } else { 'mp3' }
    return (File-Name @{ disc=1; track=54; title="EuroDemo 'Slow Techno'"; artist='Soaresden'; workspace='Lucie'; year='2026'; genre='Techno'; id='1a2b3c4d-0000-0000-0000-000000000000' }) + ".$ext"
}

# ---- TagLib-Sharp ---------------------------------------------------
$TagLibDll = Join-Path $Root 'lib\TagLibSharp.dll'
$TagLibOk = $false
if (Test-Path $TagLibDll) {
    try { Add-Type -Path $TagLibDll; $TagLibOk = $true }
    catch { Write-Host "TagLib missing/incompatible: $($_.Exception.Message)" -ForegroundColor Yellow }
}

# ---- Clerk auth (JWT ~50s, rafraichi a la demande) ------------------
$script:Jwt = $null; $script:JwtAt = [datetime]::MinValue; $script:Sid = $null
$ClerkQS = '?__clerk_api_version=2025-11-10&_clerk_js_version=5.117.0'

# Clerk calls go through HttpClient with automatic cookies OFF, so the __client cookie header is
# sent exactly as written (Windows PowerShell 5.1's Invoke-RestMethod may drop a hand-set Cookie).
Add-Type -AssemblyName System.Net.Http
$script:ClerkHttp = $null
function Clerk-Send($method, $path) {
    if (-not $script:ClerkHttp) {
        $hh = New-Object System.Net.Http.HttpClientHandler
        $hh.UseCookies = $false
        $script:ClerkHttp = New-Object System.Net.Http.HttpClient($hh)
        $script:ClerkHttp.Timeout = [TimeSpan]::FromSeconds(20)
    }
    $url = $Cfg.clerkBase + $path + $ClerkQS
    $req = New-Object System.Net.Http.HttpRequestMessage((New-Object System.Net.Http.HttpMethod($method)), $url)
    [void]$req.Headers.TryAddWithoutValidation('Cookie', "__client=$($Cfg.clientCookie)")
    [void]$req.Headers.TryAddWithoutValidation('Authorization', [string]$Cfg.clientCookie)
    [void]$req.Headers.TryAddWithoutValidation('Origin', 'https://suno.com')
    [void]$req.Headers.TryAddWithoutValidation('Referer', 'https://suno.com/')
    [void]$req.Headers.TryAddWithoutValidation('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36')
    if ($method -eq 'POST') { $req.Content = New-Object System.Net.Http.StringContent('', [Text.Encoding]::UTF8, 'application/x-www-form-urlencoded') }
    $resp = $script:ClerkHttp.SendAsync($req).GetAwaiter().GetResult()
    $body = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $resp.IsSuccessStatusCode) { throw "Clerk $path -> HTTP $([int]$resp.StatusCode)" }
    return ($body | ConvertFrom-Json)
}
function Clerk-Get($path)  { return Clerk-Send 'GET' $path }
function Clerk-Post($path) { return Clerk-Send 'POST' $path }
$script:AccountLabel = $null
function Get-SessionId {
    $r = Clerk-Get '/v1/client'
    $sid = $r.response.last_active_session_id
    if (-not $sid) { $n = @($r.response.sessions).Count; throw "Suno sees no signed-in session for this cookie (sessions: $n)" }
    try {
        $sess = @($r.response.sessions) | Where-Object { $_.id -eq $sid } | Select-Object -First 1
        $u = $sess.user
        $name = $u.username; if (-not $name) { $name = (@($u.first_name, $u.last_name) | Where-Object { $_ }) -join ' ' }
        $mail = $null; if ($u.email_addresses) { $mail = @($u.email_addresses)[0].email_address }
        $script:AccountLabel = (@($name, $mail) | Where-Object { $_ }) -join ' - '
    } catch {}
    return $sid
}
function Get-Jwt {
    if ($script:Jwt -and ((New-TimeSpan $script:JwtAt (Get-Date)).TotalSeconds -lt 50)) { return $script:Jwt }
    if (-not $Cfg.clientCookie) { throw "NO_COOKIE" }
    if (-not $script:Sid) { $script:Sid = Get-SessionId }
    try { $r = Clerk-Post "/v1/client/sessions/$($script:Sid)/tokens" }
    catch { $script:Sid = Get-SessionId; $r = Clerk-Post "/v1/client/sessions/$($script:Sid)/tokens" }
    if (-not $r.jwt) { throw "Empty JWT" }
    $script:Jwt = $r.jwt; $script:JwtAt = Get-Date
    return $script:Jwt
}
function Browser-Token {
    $ms = [int64]([datetimeoffset]::UtcNow.ToUnixTimeMilliseconds())
    $json = "{`"timestamp`":$ms}"
    return [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
}
function Suno-Headers {
    $jwt = Get-Jwt
    return @{
        'Authorization' = "Bearer $jwt"
        'device-id'     = $Cfg.deviceId
        'browser-token' = (Browser-Token)
        'Accept'        = 'application/json'
        'Origin'        = 'https://suno.com'
        'Referer'       = 'https://suno.com/'
        'User-Agent'    = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
}

# ---- Login automatique (ouvre un navigateur, recupere __client via CDP) ----
function Find-Browser {
    $paths = @(
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    foreach ($p in $paths) { if (Test-Path $p) { return $p } }
    return $null
}
$script:LoginPort = 9222
function Start-Login {
    # Already open from a previous click? Just check it again.
    if ((Get-SunoCookies).reachable) { return @{ ok=$true; reused=$true } }
    $b = Find-Browser
    if (-not $b) { return @{ ok=$false; code='no_browser'; error="Neither Edge nor Chrome was found." } }
    # Dedicated profile kept between runs: once signed in, the next connection is instant.
    $udd = Join-Path $env:LOCALAPPDATA 'SUNODLAA\login-profile'
    New-Item -ItemType Directory -Force -Path $udd | Out-Null
    $argList = @(
        "--user-data-dir=`"$udd`"",
        "--remote-debugging-port=$($script:LoginPort)",
        "--remote-allow-origins=*",
        "--no-first-run", "--no-default-browser-check",
        "--new-window", "https://suno.com/"
    )
    Start-Process -FilePath $b -ArgumentList $argList | Out-Null
    return @{ ok=$true; browser=(Split-Path $b -Leaf) }
}

# One Chrome DevTools Protocol call over WebSocket; returns the "result" object or $null.
function Cdp-Call($wsUrl, $method, $params) {
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = [Threading.CancellationToken]::None
    try {
        if (-not $ws.ConnectAsync([Uri]$wsUrl, $ct).Wait(5000)) { return $null }
        if ($ws.State -ne [System.Net.WebSockets.WebSocketState]::Open) { return $null }
        $p = @{}; if ($params) { $p = $params }
        $msg = @{ id = 1; method = $method; params = $p } | ConvertTo-Json -Depth 6 -Compress
        $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
        $ws.SendAsync([ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()
        $buf = New-Object byte[] 1048576
        for ($n = 0; $n -lt 50; $n++) {
            $sb = New-Object Text.StringBuilder
            do {
                $t = $ws.ReceiveAsync([ArraySegment[byte]]::new($buf), $ct)
                if (-not $t.Wait(8000)) { return $null }
                $r = $t.Result
                [void]$sb.Append([Text.Encoding]::UTF8.GetString($buf, 0, $r.Count))
            } while (-not $r.EndOfMessage)
            $o = $sb.ToString() | ConvertFrom-Json
            if ($o.id -eq 1) { if ($o.error) { return $null }; return $o.result }
        }
        return $null
    } catch { return $null }
    finally { try { $ws.Dispose() } catch {} }
}

# Suno cookies from the login window. reachable=$false when that browser window is closed.
function Get-SunoCookies {
    $base = "http://127.0.0.1:$($script:LoginPort)"
    try { $ver = Invoke-RestMethod "$base/json/version" -TimeoutSec 3 } catch { return @{ reachable = $false; cookies = @() } }
    $cookies = @(); $url = $null
    try {
        $pages = @(Invoke-RestMethod "$base/json/list" -TimeoutSec 3) | Where-Object { $_.type -eq 'page' }
        $sunoPage = $pages | Where-Object { $_.url -like '*suno.com*' } | Select-Object -First 1
        if ($sunoPage) { $url = $sunoPage.url } elseif ($pages) { $url = @($pages)[0].url }
    } catch {}
    # 1) whole browser (current Chrome/Edge)
    if ($ver.webSocketDebuggerUrl) {
        $r = Cdp-Call $ver.webSocketDebuggerUrl 'Storage.getCookies' $null
        if ($r -and $r.cookies) { $cookies = @($r.cookies) }
    }
    # 2) fallback: ask a page for the suno.com cookies
    if ($cookies.Count -eq 0) {
        $page = $pages | Where-Object { $_.webSocketDebuggerUrl } | Select-Object -First 1
        if ($page) {
            $r = Cdp-Call $page.webSocketDebuggerUrl 'Network.getCookies' @{ urls = @('https://suno.com/', 'https://auth.suno.com/', 'https://clerk.suno.com/') }
            if ($r -and $r.cookies) { $cookies = @($r.cookies) }
        }
    }
    $cookies = @($cookies | Where-Object { $_.domain -like '*suno.com' -or $_.domain -like '*.suno.com' -or $_.domain -eq 'suno.com' })
    return @{ reachable = $true; cookies = $cookies; url = $url }
}

function Try-CaptureLogin {
    $st = Get-SunoCookies
    if (-not $st.reachable) { return @{ ok=$false; code='window_closed' } }
    $uat = $st.cookies | Where-Object { $_.name -eq '__client_uat' } | Sort-Object { [double]$_.value } -Descending | Select-Object -First 1
    $clients = @($st.cookies | Where-Object { $_.name -eq '__client' } | Sort-Object { if ($_.domain -like '*auth.suno.com') { 0 } else { 1 } })
    if ($clients.Count -eq 0 -or -not $uat -or $uat.value -eq '0') {
        return @{ ok=$false; code='not_signed_in'; url=$st.url; seen=@($st.cookies).Count }
    }
    $prev = $Cfg.clientCookie; $detail = $null
    foreach ($c in $clients) {
        $Cfg.clientCookie = $c.value; $script:Jwt = $null; $script:Sid = $null
        try { $null = Get-Jwt; Save-Config $Cfg; return @{ ok=$true; label=$script:AccountLabel } }
        catch { $detail = "$($c.domain): $($_.Exception.Message)" }
    }
    $Cfg.clientCookie = $prev; $script:Jwt = $null; $script:Sid = $null
    return @{ ok=$false; code='session_invalid'; detail=$detail; candidates=$clients.Count }
}

# ---- Helpers --------------------------------------------------------
function Sanitize($s) {
    if (-not $s) { return 'Untitled' }
    return ($s -replace '[\\/:*?"<>|]', '_').Trim()
}
function Read-Body($req) {
    $sr = New-Object IO.StreamReader($req.InputStream, (New-Object Text.UTF8Encoding($false)))
    $b = $sr.ReadToEnd(); $sr.Close(); return $b
}
function Write-Json($resp, $obj, $code = 200) {
    $json = ($obj | ConvertTo-Json -Depth 40 -Compress)
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $resp.StatusCode = $code
    $resp.ContentType = 'application/json; charset=utf-8'
    $resp.Headers['Access-Control-Allow-Origin'] = '*'
    $resp.OutputStream.Write($bytes, 0, $bytes.Length)
    $resp.OutputStream.Close()
}
function Write-Text($resp, $text, $ctype = 'text/html; charset=utf-8', $code = 200) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($text)
    $resp.StatusCode = $code; $resp.ContentType = $ctype
    $resp.OutputStream.Write($bytes, 0, $bytes.Length); $resp.OutputStream.Close()
}

# ---- Scan bibliotheque locale (en arriere-plan, avec index en cache) -------
# Only the workspace folders ("Suno - ...", or the folder pattern) are scanned.
# For each audio file we read only the ID3 frame headers (a few KB, no cover
# art), keep TSRC / TXXX / COMM (Suno id), TIT2 (title) and TALB (album).
# Results are stored in cache\local-index.json: next scans only re-read files
# whose size or date changed.
$script:ScanMap = @{}
$script:ScanFiles = $null
$script:ScanState = [hashtable]::Synchronized(@{ running=$false; done=0; total=0; error=$null; finishedAt=$null; startedAt=$null; result=$null; folders=0 })
$script:ScanJob = $null

$ScanScript = {
    param($lib, $indexPath, $state, $logFile, $patPrefix, $patSuffix)
    function L($m) { try { [IO.File]::AppendAllText($logFile, ('{0} [SCAN] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'), $m) + "`r`n", (New-Object Text.UTF8Encoding($false))) } catch {} }
    $uuidRx = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
    function Dec([byte[]]$b, [int]$off, [int]$enc) {
        if ($off -ge $b.Length) { return '' }
        $n = $b.Length - $off
        switch ($enc) {
            0 { $t = [Text.Encoding]::GetEncoding(28591).GetString($b, $off, $n) }
            1 { $t = [Text.Encoding]::Unicode.GetString($b, $off, $n)
                if ($n -ge 2 -and $b[$off] -eq 0xFE -and $b[$off+1] -eq 0xFF) { $t = [Text.Encoding]::BigEndianUnicode.GetString($b, $off, $n) } }
            2 { $t = [Text.Encoding]::BigEndianUnicode.GetString($b, $off, $n) }
            default { $t = [Text.Encoding]::UTF8.GetString($b, $off, $n) }
        }
        return ($t -replace "[\uFEFF\uFFFE]", '')
    }
    function Clean($t) { return (($t -split "`0" | Where-Object { $_ -ne '' }) -join ' ').Trim() }
    function Read-Exact($fs, [int]$n) {
        $buf = New-Object byte[] $n; $got = 0
        while ($got -lt $n) { $r = $fs.Read($buf, $got, $n - $got); if ($r -le 0) { break }; $got += $r }
        if ($got -lt $n) { return $null }
        return ,$buf
    }
    # Parse an ID3v2 tag starting at the current stream position.
    function Read-Id3($fs, $info) {
        $h = Read-Exact $fs 10
        if (-not $h -or [int]$h[0] -ne 0x49 -or [int]$h[1] -ne 0x44 -or [int]$h[2] -ne 0x33) { return }
        $ver = [int]$h[3]; $flags = [int]$h[5]
        $size = ([int]$h[6] -shl 21) -bor ([int]$h[7] -shl 14) -bor ([int]$h[8] -shl 7) -bor [int]$h[9]
        $start = $fs.Position; $end = $start + $size
        if ($flags -band 0x40) {
            $e = Read-Exact $fs 4; if (-not $e) { return }
            if ($ver -eq 4) { $es = ([int]$e[0] -shl 21) -bor ([int]$e[1] -shl 14) -bor ([int]$e[2] -shl 7) -bor [int]$e[3]; $fs.Position = $start + $es }
            else { $es = ([int]$e[0] -shl 24) -bor ([int]$e[1] -shl 16) -bor ([int]$e[2] -shl 8) -bor [int]$e[3]; $fs.Position = $start + 4 + $es }
        }
        $hl = 10; if ($ver -eq 2) { $hl = 6 }
        $guard = 0
        while (($fs.Position + $hl) -le $end -and $guard -lt 400) {
            $guard++
            $fh = Read-Exact $fs $hl; if (-not $fh) { break }
            if ([int]$fh[0] -eq 0) { break }
            if ($ver -eq 2) {
                $fid = [Text.Encoding]::ASCII.GetString($fh, 0, 3)
                $fsz = ([int]$fh[3] -shl 16) -bor ([int]$fh[4] -shl 8) -bor [int]$fh[5]
                $fid = switch ($fid) { 'TT2' {'TIT2'} 'TAL' {'TALB'} 'TRC' {'TSRC'} 'TXX' {'TXXX'} 'COM' {'COMM'} 'WXX' {'WXXX'} default {$fid} }
            } else {
                $fid = [Text.Encoding]::ASCII.GetString($fh, 0, 4)
                if ($ver -eq 4) { $fsz = ([int]$fh[4] -shl 21) -bor ([int]$fh[5] -shl 14) -bor ([int]$fh[6] -shl 7) -bor [int]$fh[7] }
                else { $fsz = ([int]$fh[4] -shl 24) -bor ([int]$fh[5] -shl 16) -bor ([int]$fh[6] -shl 8) -bor [int]$fh[7] }
            }
            if ($fsz -lt 0 -or ($fs.Position + $fsz) -gt $end) { break }
            if ($fid -in @('TSRC','TIT2','TALB','TXXX','COMM','WXXX','WOAS') -and $fsz -gt 0 -and $fsz -lt 65536) {
                $d = Read-Exact $fs $fsz; if (-not $d) { break }
                switch ($fid) {
                    'TSRC' { $info.tsrc = Clean (Dec $d 1 $d[0]) }
                    'TIT2' { $info.title = Clean (Dec $d 1 $d[0]) }
                    'TALB' { $info.album = Clean (Dec $d 1 $d[0]) }
                    'COMM' { $t = Dec $d 4 $d[0]; if ($t -match $uuidRx) { if (-not $info.other) { $info.other = $Matches[0] } } }
                    'WOAS' { $t = [Text.Encoding]::ASCII.GetString($d); if ($t -match $uuidRx) { if (-not $info.other) { $info.other = $Matches[0] } } }
                    default { $t = Dec $d 1 $d[0]; if ($t -match $uuidRx) { if (-not $info.other) { $info.other = $Matches[0] } } }
                }
            } else {
                $fs.Position = $fs.Position + $fsz
            }
        }
    }
    function Read-Tags($path) {
        $info = @{ tsrc=$null; title=$null; album=$null; other=$null }
        $fs = $null
        try {
            $fs = New-Object IO.FileStream($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite, 8192)
            $h = Read-Exact $fs 12
            if (-not $h) { return $info }
            $sig = [Text.Encoding]::ASCII.GetString($h, 0, 4)
            if ($sig.StartsWith('ID3')) { $fs.Position = 0; Read-Id3 $fs $info }
            elseif ($sig -eq 'RIFF' -and [Text.Encoding]::ASCII.GetString($h, 8, 4) -eq 'WAVE') {
                $n = 0
                while (($fs.Position + 8) -le $fs.Length -and $n -lt 64) {
                    $n++
                    $ch = Read-Exact $fs 8; if (-not $ch) { break }
                    $cid = [Text.Encoding]::ASCII.GetString($ch, 0, 4)
                    $csz = [BitConverter]::ToUInt32($ch, 4)
                    $next = $fs.Position + $csz + ($csz % 2)
                    if ($cid -eq 'id3 ' -or $cid -eq 'ID3 ') { Read-Id3 $fs $info; break }
                    $fs.Position = $next
                }
            }
        } catch {} finally { if ($fs) { $fs.Dispose() } }
        return $info
    }

    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        $state.error = $null; $state.done = 0; $state.total = 0
        $prev = @{}
        if (Test-Path -LiteralPath $indexPath) {
            try {
                $old = [IO.File]::ReadAllText($indexPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
                foreach ($f in @($old.files)) { if ($f.p) { $prev[[string]$f.p] = $f } }
            } catch { L "index unreadable, full rescan: $($_.Exception.Message)" }
        }
        $wsRx = '^\s*suno\s*[-\u2013\u2014]\s*'
        $dirs = @()
        foreach ($d in (Get-ChildItem -LiteralPath $lib -Directory -ErrorAction SilentlyContinue)) {
            $ws = $null
            if ($d.Name -match $wsRx) { $ws = ($d.Name -replace $wsRx, '').Trim() }
            elseif (($patPrefix -or $patSuffix) -and $d.Name.StartsWith($patPrefix, [StringComparison]::OrdinalIgnoreCase) -and $d.Name.EndsWith($patSuffix, [StringComparison]::OrdinalIgnoreCase) -and $d.Name.Length -gt ($patPrefix.Length + $patSuffix.Length)) {
                $ws = $d.Name.Substring($patPrefix.Length, $d.Name.Length - $patPrefix.Length - $patSuffix.Length).Trim()
            }
            if ($ws) { $dirs += ,@($d.FullName, $ws) }
        }
        $state.folders = $dirs.Count
        L ("start: {0} workspace folders in {1} ({2} files in previous index)" -f $dirs.Count, $lib, $prev.Count)
        $exts = @('.mp3', '.wav', '.m4a', '.flac', '.ogg', '.opus', '.aac')
        $list = New-Object Collections.ArrayList
        foreach ($d in $dirs) {
            foreach ($f in (Get-ChildItem -LiteralPath $d[0] -Recurse -File -ErrorAction SilentlyContinue)) {
                if ($exts -contains $f.Extension.ToLower()) { [void]$list.Add(@($f, $d[1])) }
            }
        }
        $state.total = $list.Count
        L ("listing done: {0} audio files ({1} ms)" -f $list.Count, $sw.ElapsedMilliseconds)
        $out = New-Object Collections.ArrayList
        $reused = 0; $read = 0; $withId = 0
        foreach ($it in $list) {
            $f = $it[0]; $ws = $it[1]
            $mt = $f.LastWriteTimeUtc.Ticks
            $o = $prev[$f.FullName]
            if ($o -and [long]$o.len -eq $f.Length -and [long]$o.mt -eq $mt) {
                $e = [ordered]@{ p=$f.FullName; len=$f.Length; mt=$mt; id=$o.id; id8=$o.id8; t=$o.t; ft=$o.ft; al=$o.al; w=$ws }
                $reused++
            } else {
                $tg = Read-Tags $f.FullName
                $read++
                $id = $null
                if ($tg.tsrc -and $tg.tsrc -match ('^' + $uuidRx + '$')) { $id = $tg.tsrc.ToLower() }
                elseif ($tg.other) { $id = $tg.other.ToLower() }
                elseif ($f.BaseName -match $uuidRx) { $id = $Matches[0].ToLower() }
                $id8 = $null
                if ($id) { $id8 = $id.Substring(0, 8) }
                elseif ($f.BaseName -match '[\(\[]([0-9a-fA-F]{8})[\)\]]\s*$') { $id8 = $Matches[1].ToLower() }
                elseif ($tg.tsrc -and $tg.tsrc -match '^[0-9a-fA-F]{8}') { $id8 = $tg.tsrc.Substring(0, 8).ToLower() }
                $ft = $f.BaseName -replace '\s*[\(\[][0-9a-fA-F]{8}[\)\]]\s*$', ''
                $ft = ($ft -replace '^\s*\d+(?:[-_ .]+\d+)*\s*(?:[-_.]\s*)?', '').Trim()
                if (-not $ft) { $ft = $f.BaseName }
                $e = [ordered]@{ p=$f.FullName; len=$f.Length; mt=$mt; id=$id; id8=$id8; t=$tg.title; ft=$ft; al=$tg.album; w=$ws }
            }
            if ($e.id) { $withId++ }
            [void]$out.Add($e)
            $state.done = $state.done + 1
        }
        $json = ConvertTo-Json -InputObject @{ version=1; library=$lib; scannedAt=(Get-Date).ToString('o'); files=@($out) } -Depth 4 -Compress
        [IO.File]::WriteAllText($indexPath, $json, (New-Object Text.UTF8Encoding($false)))
        $state.result = $out
        L ("done: {0} files ({1} with Suno id, {2} re-read, {3} from cache) in {4} ms" -f $out.Count, $withId, $read, $reused, $sw.ElapsedMilliseconds)
    } catch {
        $state.error = "$($_.Exception.Message)"
        L "ERROR $($_.Exception.Message)"
    } finally {
        $state.finishedAt = (Get-Date).ToString('o')
        $state.running = $false
    }
}

function Start-ScanJob {
    Sync-ScanResult
    if ($script:ScanState.running) { return @{ ok=$true; running=$true; already=$true } }
    if (-not $Cfg.libraryPath -or -not (Test-Path -LiteralPath $Cfg.libraryPath)) { return @{ ok=$false; code='no_library' } }
    $fp = [string]$Cfg.folderPattern; $pre = ''; $suf = ''
    $i = $fp.IndexOf('{workspace}')
    if ($i -ge 0) { $pre = $fp.Substring(0, $i); $suf = $fp.Substring($i + 11) }
    $script:ScanState.running = $true
    $script:ScanState.startedAt = (Get-Date).ToString('o')
    $script:ScanState.result = $null
    $ps = [PowerShell]::Create()
    [void]$ps.AddScript($ScanScript).AddArgument([string]$Cfg.libraryPath).AddArgument($IndexPath).AddArgument($script:ScanState).AddArgument($LogFile).AddArgument($pre).AddArgument($suf)
    $script:ScanJob = @{ ps=$ps; handle=$ps.BeginInvoke() }
    Log 'INFO' "scan started in background: $($Cfg.libraryPath)"
    return @{ ok=$true; running=$true }
}
function Sync-ScanResult {
    if ($script:ScanJob -and -not $script:ScanState.running) {
        try { [void]$script:ScanJob.ps.EndInvoke($script:ScanJob.handle) } catch { Log 'ERROR' "scan: $($_.Exception.Message)" }
        try { $script:ScanJob.ps.Dispose() } catch {}
        $script:ScanJob = $null
        if ($script:ScanState.result) {
            $script:ScanFiles = @($script:ScanState.result)
            $m = @{}
            foreach ($f in $script:ScanFiles) { if ($f.id) { $m[[string]$f.id] = $f.p } }
            $script:ScanMap = $m
        }
    }
}
function Scan-Library { Sync-ScanResult; return $script:ScanMap }

# ---- Renommage des dossiers existants selon le format choisi -------------
# Detecte les dossiers de workspace ("Suno -Lucie", "suno-Lucie", "Suno - Lucie"...)
# et calcule leur nouveau nom avec folderPattern. Le reste du nom est garde tel quel.
$WsFolderRegex = '^\s*suno\s*[-\u2013\u2014]\s*'
function Folder-Plan {
    $plan = @()
    if (-not $Cfg.libraryPath -or -not (Test-Path -LiteralPath $Cfg.libraryPath)) { return ,$plan }
    $existing = @{}
    Get-ChildItem -LiteralPath $Cfg.libraryPath -Directory -ErrorAction SilentlyContinue | ForEach-Object { $existing[$_.Name.ToLower()] = $true }
    Get-ChildItem -LiteralPath $Cfg.libraryPath -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.Name -notmatch $WsFolderRegex) { return }
        $ws = ($_.Name -replace $WsFolderRegex, '').Trim()
        if (-not $ws) { return }
        $target = Folder-Name $ws
        $status = 'rename'
        if ($target -ceq $_.Name) { $status = 'same' }
        elseif ($target.ToLower() -ne $_.Name.ToLower() -and $existing.ContainsKey($target.ToLower())) { $status = 'conflict' }
        $plan += [pscustomobject]@{ from = $_.Name; to = $target; status = $status }
    }
    return ,$plan
}
function Folder-Apply {
    $done = 0; $skipped = 0; $errors = @()
    foreach ($p in (Folder-Plan)) {
        if ($p.status -ne 'rename') { if ($p.status -eq 'conflict') { $skipped++ }; continue }
        try {
            $src = Join-Path $Cfg.libraryPath $p.from
            if ($p.to.ToLower() -eq $p.from.ToLower()) {
                # changement de casse seule : passer par un nom temporaire
                $tmp = $p.from + '.~sunodlaa'
                Rename-Item -LiteralPath $src -NewName $tmp -ErrorAction Stop
                Rename-Item -LiteralPath (Join-Path $Cfg.libraryPath $tmp) -NewName $p.to -ErrorAction Stop
            } else {
                Rename-Item -LiteralPath $src -NewName $p.to -ErrorAction Stop
            }
            $done++
        } catch { $errors += "$($p.from): $($_.Exception.Message)" }
    }
    $script:ScanMap = @{}
    return @{ ok = $true; renamed = $done; skipped = $skipped; errors = $errors }
}

# ---- Stream d'un fichier local (avec support Range pour le seek) ----
function Stream-File($req, $resp, $file) {
    $fs = [IO.File]::OpenRead($file)
    try {
        $total = $fs.Length
        $range = $req.Headers['Range']
        $start = 0; $end = $total - 1
        if ($range -and $range -match 'bytes=(\d+)-(\d*)') {
            $start = [int64]$Matches[1]
            if ($Matches[2]) { $end = [int64]$Matches[2] }
            $resp.StatusCode = 206
            $resp.AddHeader('Content-Range', "bytes $start-$end/$total")
        }
        $resp.AddHeader('Accept-Ranges', 'bytes')
        $resp.ContentType = $(if ($file -like '*.wav') { 'audio/wav' } else { 'audio/mpeg' })
        $len = $end - $start + 1
        $resp.ContentLength64 = $len
        $fs.Seek($start, [IO.SeekOrigin]::Begin) | Out-Null
        $buf = New-Object byte[] 65536
        $remaining = $len
        while ($remaining -gt 0) {
            $toRead = [Math]::Min($buf.Length, $remaining)
            $n = $fs.Read($buf, 0, $toRead)
            if ($n -le 0) { break }
            $resp.OutputStream.Write($buf, 0, $n)
            $remaining -= $n
        }
        $resp.OutputStream.Close()
    } finally { $fs.Dispose() }
}

# ---- Paroles synchronisees -> .lrc -------------------------------------
# /api/gen/{id}/aligned_lyrics/v2/ renvoie aligned_lyrics (lignes) et/ou aligned_words (mots).
# On ne cree le .lrc que si Suno fournit un vrai minutage.
function Get-AlignedLyrics($id) {
    return Invoke-RestMethod -Uri ($Cfg.apiBase + "/api/gen/$id/aligned_lyrics/v2/") -Headers (Suno-Headers) -Method Get
}
function Build-Lrc($data) {
    $inv = [Globalization.CultureInfo]::InvariantCulture
    $lines = New-Object System.Collections.ArrayList
    if ($data.aligned_lyrics) {
        foreach ($l in @($data.aligned_lyrics)) {
            $t = (([string]$l.text) -replace '\s+', ' ').Trim()
            if ($t -and $null -ne $l.start_s -and $t -notmatch '^\[.*\]$') { [void]$lines.Add(@([double]$l.start_s, $t)) }
        }
    }
    if ($lines.Count -eq 0 -and $data.aligned_words) {
        $cur = ''; $start = $null
        foreach ($w in @($data.aligned_words)) {
            $txt = [string]$w.word
            if ($null -eq $start -and $txt.Trim()) { $start = [double]$w.start_s }
            $cur += $txt + ' '
            if ($txt -match "`n") {
                $t = ($cur -replace '\s+', ' ').Trim()
                if ($t -and $null -ne $start -and $t -notmatch '^\[.*\]$') { [void]$lines.Add(@($start, $t)) }
                $cur = ''; $start = $null
            }
        }
        $t = ($cur -replace '\s+', ' ').Trim()
        if ($t -and $null -ne $start -and $t -notmatch '^\[.*\]$') { [void]$lines.Add(@($start, $t)) }
    }
    if ($lines.Count -eq 0) { return $null }
    $sb = New-Object Text.StringBuilder
    foreach ($l in $lines) {
        $sec = [double]$l[0]; $m = [int][Math]::Floor($sec / 60); $rest = $sec - 60 * $m
        [void]$sb.AppendLine([string]::Format($inv, '[{0:00}:{1:00.00}]{2}', $m, $rest, $l[1]))
    }
    return $sb.ToString()
}

# ---- Selecteur de dossier Windows natif --------------------------------
function Pick-Folder($start) {
    Add-Type -AssemblyName System.Windows.Forms
    $owner = New-Object System.Windows.Forms.Form
    $owner.TopMost = $true; $owner.ShowInTaskbar = $false; $owner.Opacity = 0
    $owner.StartPosition = 'CenterScreen'; $owner.Size = New-Object System.Drawing.Size(1, 1)
    $owner.Show(); $owner.Activate()
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = 'SUNODLAA - choose the folder for your Suno music'
    $dlg.ShowNewFolderButton = $true
    if ($start -and (Test-Path -LiteralPath $start)) { $dlg.SelectedPath = $start }
    try { $r = $dlg.ShowDialog($owner) } finally { $owner.Close(); $owner.Dispose() }
    if ($r -eq [System.Windows.Forms.DialogResult]::OK) { return $dlg.SelectedPath }
    return $null
}

# ---- Telechargement + tag ------------------------------------------
# Lien de telechargement officiel (bouton "Download" du site) : mp3 ou wav selon l'offre.
function Resolve-Download($id, $fmt) {
    for ($i = 0; $i -lt 20; $i++) {
        $r = Invoke-RestMethod -Uri ($Cfg.apiBase + "/api/download/clip/$id" + "?format=$fmt") -Headers (Suno-Headers) -Method Get
        if ($r.url) { return @{ url = $r.url } }
        if ($r.status -ne 'processing') {
            $why = 'No download link from Suno'
            if ($r.reason) { $why = [string]$r.reason } elseif ($r.message) { $why = [string]$r.message }
            return @{ why = $why }
        }
        Start-Sleep -Seconds 2
    }
    return @{ why = 'Suno is still preparing the file - try again in a minute' }
}

function Download-Clip($body) {
    $clipId    = $body.clipId
    $audioUrl  = $body.audioUrl
    $title     = $body.title
    $artist    = if ($body.artist) { $body.artist } else { 'Suno' }
    $workspace = if ($body.workspace) { $body.workspace } else { 'Misc' }
    $disc      = if ($body.disc) { [int]$body.disc } else { 1 }
    $track     = if ($body.track) { [int]$body.track } else { 1 }
    $tags      = $body.tags
    $imageUrl  = $body.imageUrl
    $lyrics    = $body.lyrics
    $createdAt = $body.createdAt

    if (-not $Cfg.libraryPath -or -not (Test-Path -LiteralPath $Cfg.libraryPath)) { return @{ ok = $false; code = 'no_library'; error = 'Choose your music folder first (Setup, step 2).' } }
    $format = if ($Cfg.audioFormat -eq 'wav') { 'wav' } else { 'mp3' }
    # 1) lien officiel de Suno (respecte l'offre du compte) ; 2) en MP3, lien direct du clip
    $url = $null; $why = $null
    if ($clipId) {
        try { $r = Resolve-Download $clipId $format; $url = $r.url; $why = $r.why } catch { $why = $_.Exception.Message }
    }
    if (-not $url -and $format -eq 'mp3' -and $audioUrl) { $url = $audioUrl }
    if (-not $url) {
        $code = 'no_link'
        if ($why -eq 'not_authorized') { $code = 'not_authorized'; $why = "Suno refused the $($format.ToUpper()) download on this account (plan without downloads)" }
        return @{ ok = $false; code = $code; format = $format; error = $(if ($why) { $why } else { 'No download link from Suno' }) }
    }

    $folderName = Folder-Name $workspace
    $dir = Join-Path $Cfg.libraryPath $folderName
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $year = ''; if ($createdAt -and $createdAt.Length -ge 4) { $year = $createdAt.Substring(0, 4) }
    $base = File-Name @{ disc=$disc; track=$track; title=$title; artist=$artist; workspace=$workspace; year=$year; genre=$tags; id=$clipId }
    $out = Join-Path $dir ($base + '.' + $format)

    try {
        Fetch-Retry $url $out
    } catch {
        if ($url -ne $audioUrl -and $format -eq 'mp3' -and $audioUrl) {
            try { Invoke-WebRequest -Uri $audioUrl -OutFile $out -UseBasicParsing -TimeoutSec 300 }
            catch { return @{ ok = $false; code = 'refused'; error = "Download refused: $($_.Exception.Message)" } }
        } else { return @{ ok = $false; code = 'refused'; error = "Download refused: $($_.Exception.Message)" } }
    }

    if ($TagLibOk) {
        try {
            $tf = [TagLib.File]::Create($out)
            $tf.Tag.Title = $title
            $tf.Tag.Performers = @($artist)
            $tf.Tag.Album = $folderName
            $tf.Tag.Track = [uint32]$track
            $tf.Tag.Disc  = [uint32]$disc
            $tf.Tag.Genres = @('Suno AI')
            if ($clipId) { $tf.Tag.ISRC = $clipId }        # -> frame TSRC (lu par l'app Android)
            if ($createdAt -and $createdAt.Length -ge 4) {
                $y = 0; if ([int]::TryParse($createdAt.Substring(0,4), [ref]$y)) { $tf.Tag.Year = [uint32]$y }
            }
            $comment = "Downloaded with SUNODLAA - https://github.com/soaresden/SunoDLAA"
            if ($tags) { $comment += "`nStyle: $tags" }
            $tf.Tag.Comment = $comment
            if ($lyrics) { $tf.Tag.Lyrics = $lyrics }
            if ($imageUrl) {
                try {
                    $img = Invoke-WebRequest -Uri $imageUrl -UseBasicParsing -TimeoutSec 30
                    $bv = New-Object TagLib.ByteVector (,$img.Content)
                    $pic = New-Object TagLib.Picture $bv
                    $pic.Type = [TagLib.PictureType]::FrontCover
                    $pic.MimeType = 'image/jpeg'
                    $pic.Description = 'Cover'
                    $tf.Tag.Pictures = @($pic)
                } catch {}
            }
            $tf.Save(); $tf.Dispose()
        } catch {
            return @{ ok = $true; path = $out; warn = "File OK but tags partial: $($_.Exception.Message)" }
        }
    }
    $lrc = $false
    if ($Cfg.saveLrc -and $clipId) {
        try {
            $txt = Build-Lrc (Get-AlignedLyrics $clipId)
            if ($txt) {
                $lrcPath = [IO.Path]::ChangeExtension($out, '.lrc')
                [IO.File]::WriteAllText($lrcPath, $txt, (New-Object Text.UTF8Encoding($true)))
                $lrc = $true
            }
        } catch {}
    }
    $delay = 0; try { $delay = [double]$Cfg.downloadDelaySec } catch {}
    if ($delay -gt 0) { Start-Sleep -Milliseconds ([int]($delay * 1000)) }
    if ($clipId) { $script:ScanMap[[string]$clipId] = $out }
    Log 'DL' "ok $clipId -> $out (lrc: $lrc)"
    return @{ ok = $true; path = $out; lrc = $lrc }
}

# Download with 3 attempts (1 s, 2 s pauses) - not for 401/403/404 (Suno refused)
function Fetch-Retry($u, $o) {
    for ($a = 1; $a -le 3; $a++) {
        try { Invoke-WebRequest -Uri $u -OutFile $o -UseBasicParsing -TimeoutSec 300; return }
        catch {
            $c = 0; if ($_.Exception.Response) { $c = [int]$_.Exception.Response.StatusCode }
            if ($a -eq 3 -or $c -in @(401, 403, 404)) { throw }
            Log 'DL' "retry $a after error: $($_.Exception.Message)"
            Start-Sleep -Seconds $a
        }
    }
}

# ---- Routeur --------------------------------------------------------
$port = if ($Cfg.port) { [int]$Cfg.port } else { 8787 }
$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$port/"
$listener.Prefixes.Add($prefix)
try { $listener.Start() }
catch { Write-Host "Cannot open $prefix : $($_.Exception.Message)" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  SUNODLAA - desktop" -ForegroundColor Cyan
Write-Host "  Open:     $prefix" -ForegroundColor Green
Write-Host "  Library:  $($Cfg.libraryPath)"
Write-Host "  TagLib:   $(if($TagLibOk){'OK'}else{'MISSING (tagging disabled)'})"
Write-Host "  (Close this window to stop)" -ForegroundColor DarkGray
Write-Host ""

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
    } catch { break }
    $req = $ctx.Request; $resp = $ctx.Response
    $path = $req.Url.AbsolutePath
    $t0 = [Diagnostics.Stopwatch]::StartNew()
    try {
        if ($req.HttpMethod -eq 'OPTIONS') {
            $resp.Headers['Access-Control-Allow-Origin'] = '*'
            $resp.Headers['Access-Control-Allow-Headers'] = '*'
            $resp.Headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
            $resp.StatusCode = 204; $resp.OutputStream.Close(); continue
        }

        switch -Regex ($path) {
            '^/$' {
                $html = Get-Content (Join-Path $Root 'index.html') -Raw -Encoding UTF8
                Write-Text $resp $html; break
            }
            '^/api/config$' {
                if ($req.HttpMethod -eq 'POST') {
                    $b = Read-Body $req | ConvertFrom-Json
                    if ($null -ne $b.port)        { $Cfg.port = [int]$b.port }
                    if ($null -ne $b.libraryPath) { $Cfg.libraryPath = $b.libraryPath }
                    if ($null -ne $b.clientCookie){ $Cfg.clientCookie = $b.clientCookie; $script:Jwt=$null; $script:Sid=$null }
                    if ($null -ne $b.deviceId)    { $Cfg.deviceId = $b.deviceId }
                    if ($null -ne $b.folderPattern -and $b.folderPattern) { $Cfg.folderPattern = $b.folderPattern }
                    if ($b.language -in @('en','fr')) { $Cfg.language = $b.language }
                    if ($null -ne $b.fileNamePattern -and $b.fileNamePattern) { $Cfg.fileNamePattern = $b.fileNamePattern }
                    if ($b.audioFormat -in @('mp3','wav')) { $Cfg.audioFormat = $b.audioFormat }
                    if ($null -ne $b.saveLrc) { $Cfg.saveLrc = [bool]$b.saveLrc }
                    if ($null -ne $b.downloadDelaySec) { $Cfg.downloadDelaySec = [Math]::Max(0, [Math]::Min(30, [double]$b.downloadDelaySec)) }
                    Save-Config $Cfg
                }
                Write-Json $resp @{
                    port=$Cfg.port; libraryPath=$Cfg.libraryPath; folderPattern=$Cfg.folderPattern; language=$Cfg.language
                    folderExample=(Folder-Name 'Lucie'); fileNamePattern=$Cfg.fileNamePattern; fileExample=(File-Example); audioFormat=$Cfg.audioFormat
                    saveLrc=[bool]$Cfg.saveLrc; downloadDelaySec=$Cfg.downloadDelaySec
                    libraryExists=[bool]($Cfg.libraryPath -and (Test-Path -LiteralPath $Cfg.libraryPath))
                    hasCookie=[bool]$Cfg.clientCookie; deviceId=$Cfg.deviceId; taglib=$TagLibOk
                }; break
            }
            '^/api/login/start$' {
                Write-Json $resp (Start-Login); break
            }
            '^/api/login/check$' {
                Write-Json $resp (Try-CaptureLogin); break
            }
            '^/api/auth$' {
                try { $null = Get-Jwt; $sid=$script:Sid; Write-Json $resp @{ ok=$true; sessionId=$sid } }
                catch { Write-Json $resp @{ ok=$false; error="$($_.Exception.Message)" } }
                break
            }
            '^/api/scan/start$' {
                Write-Json $resp (Start-ScanJob); break
            }
            '^/api/scan/status$' {
                Sync-ScanResult
                $st = $script:ScanState
                Write-Json $resp @{ ok=$true; running=[bool]$st.running; done=$st.done; total=$st.total; folders=$st.folders; error=$st.error; finishedAt=$st.finishedAt; hasResult=[bool]($script:ScanFiles -ne $null) }; break
            }
            '^/api/scan/result$' {
                Sync-ScanResult
                if ($null -ne $script:ScanFiles) {
                    Write-Json $resp @{ ok=$true; fresh=$true; files=@($script:ScanFiles) }
                } elseif (Test-Path -LiteralPath $IndexPath) {
                    # last scan saved on disk (instant display while a new scan runs)
                    $txt = [IO.File]::ReadAllText($IndexPath, [Text.Encoding]::UTF8)
                    $ok = $false
                    try { $ix = $txt | ConvertFrom-Json; $ok = ([string]$ix.library -eq [string]$Cfg.libraryPath) } catch {}
                    if ($ok) {
                        if ($script:ScanMap.Count -eq 0) { foreach ($f in @($ix.files)) { if ($f.id) { $script:ScanMap[[string]$f.id] = $f.p } } }
                        Write-Text $resp ('{"ok":true,"fresh":false,"index":' + $txt + '}') 'application/json; charset=utf-8'
                    } else { Write-Json $resp @{ ok=$true; fresh=$false; files=@() } }
                } else { Write-Json $resp @{ ok=$true; fresh=$false; files=@() } }
                break
            }
            '^/api/scan$' {
                # compatibility: id -> path map (starts a scan if none ever ran)
                Sync-ScanResult
                if ($null -eq $script:ScanFiles -and -not $script:ScanState.running) { [void](Start-ScanJob) }
                Write-Json $resp @{ ok=$true; count=$script:ScanMap.Count; ids=$script:ScanMap; running=[bool]$script:ScanState.running }; break
            }
            '^/api/cache/library$' {
                if ($req.HttpMethod -eq 'POST') {
                    $b = Read-Body $req
                    [IO.File]::WriteAllText($LibraryCachePath, $b, (New-Object Text.UTF8Encoding($false)))
                    Write-Json $resp @{ ok=$true; bytes=$b.Length }
                } elseif (Test-Path -LiteralPath $LibraryCachePath) {
                    Write-Text $resp ([IO.File]::ReadAllText($LibraryCachePath, [Text.Encoding]::UTF8)) 'application/json; charset=utf-8'
                } else { Write-Text $resp '{}' 'application/json; charset=utf-8' }
                break
            }
            '^/api/cache/aliases$' {
                # optional: { "<clip id>": ["old title", ...] } - titles a track had before being renamed on Suno
                $ap = Join-Path $CacheDir 'title-aliases.json'
                if (Test-Path -LiteralPath $ap) { Write-Text $resp ([IO.File]::ReadAllText($ap, [Text.Encoding]::UTF8)) 'application/json; charset=utf-8' }
                else { Write-Text $resp '{}' 'application/json; charset=utf-8' }
                break
            }
            '^/api/log$' {
                $b = Read-Body $req | ConvertFrom-Json
                Log 'UI' ([string]$b.msg)
                Write-Json $resp @{ ok=$true }; break
            }
            '^/api/suno$' {
                # proxy : /api/suno?path=/api/project/me&page=1  (le reste de la query est transmis)
                $qp = [System.Web.HttpUtility]::ParseQueryString($req.Url.Query)
                $sp = $qp['path']
                if (-not $sp) { Write-Json $resp @{ error='missing path' } 400; break }
                $extra = @()
                foreach ($k in $qp.AllKeys) { if ($k -ne 'path') { $extra += ("$k=" + [uri]::EscapeDataString($qp[$k])) } }
                $sep = if ($sp.Contains('?')) { '&' } else { '?' }
                $url = $Cfg.apiBase + $sp + $(if ($extra.Count) { $sep + ($extra -join '&') } else { '' })
                try {
                    $data = Invoke-RestMethod -Uri $url -Headers (Suno-Headers) -Method Get
                    Write-Json $resp $data
                } catch {
                    $code = 502; if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
                    Log 'SUNO' "error $code on $sp : $($_.Exception.Message)"
                    Write-Json $resp @{ error="$($_.Exception.Message)"; status=$code } $code
                }
                break
            }
            '^/api/lyrics$' {
                $qp = [System.Web.HttpUtility]::ParseQueryString($req.Url.Query)
                $id = $qp['id']
                try {
                    $data = Get-AlignedLyrics $id
                    Write-Json $resp $data
                } catch { Write-Json $resp @{ error="$($_.Exception.Message)" } 502 }
                break
            }
            '^/api/download$' {
                $b = Read-Body $req | ConvertFrom-Json
                $r = Download-Clip $b
                if (-not $r.ok) { Log 'DL' "FAIL $($b.clipId) '$($b.title)' [$($b.workspace)] -> $($r.code) $($r.error)" }
                Write-Json $resp $r
                break
            }
            '^/api/folder/pick$' {
                try {
                    $p = Pick-Folder $Cfg.libraryPath
                    if ($p) { $Cfg.libraryPath = $p; $script:ScanMap = @{}; Save-Config $Cfg; Write-Json $resp @{ ok=$true; path=$p } }
                    else { Write-Json $resp @{ ok=$false; cancelled=$true } }
                } catch { Write-Json $resp @{ ok=$false; error="$($_.Exception.Message)" } }
                break
            }
            '^/api/account$' {
                try {
                    $b = Invoke-RestMethod -Uri ($Cfg.apiBase + '/api/billing/info/') -Headers (Suno-Headers) -Method Get
                    Write-Json $resp @{ ok=$true; pro=[bool]$b.is_active; credits=$b.total_credits_left; label=$script:AccountLabel }
                } catch { Write-Json $resp @{ ok=$false; error="$($_.Exception.Message)"; label=$script:AccountLabel } }
                break
            }
            '^/api/folders/preview$' {
                $plan = Folder-Plan
                Write-Json $resp @{ ok=$true; plan=@($plan) }; break
            }
            '^/api/folders/apply$' {
                Write-Json $resp (Folder-Apply); break
            }
            '^/api/play$' {
                $qp = [System.Web.HttpUtility]::ParseQueryString($req.Url.Query)
                $id = $qp['id']; $pp = $qp['path']
                Sync-ScanResult
                $file = $null
                if ($pp) {
                    # only files inside the library folder
                    $full = [IO.Path]::GetFullPath($pp); $libFull = [IO.Path]::GetFullPath([string]$Cfg.libraryPath)
                    $sep = [string][IO.Path]::DirectorySeparatorChar; if (-not $libFull.EndsWith($sep)) { $libFull += $sep }
                    if ($full.StartsWith($libFull, [StringComparison]::OrdinalIgnoreCase)) { $file = $full }
                } elseif ($id) { $file = $script:ScanMap[$id] }
                if ($file -and (Test-Path -LiteralPath $file)) { Stream-File $req $resp $file }
                else { Write-Text $resp 'no local file' 'text/plain' 404 }
                break
            }
            default {
                # fichiers statiques (lib, assets)
                $safe = ($path.TrimStart('/') -replace '\.\.', '')
                $fp = Join-Path $Root $safe
                if (Test-Path $fp -PathType Leaf) {
                    $bytes = [IO.File]::ReadAllBytes($fp)
                    $ext = [IO.Path]::GetExtension($fp).ToLower()
                    $resp.ContentType = switch ($ext) {
                        '.png' {'image/png'} '.jpg' {'image/jpeg'} '.jpeg' {'image/jpeg'}
                        '.svg' {'image/svg+xml'} '.ico' {'image/x-icon'} '.css' {'text/css'}
                        '.js' {'application/javascript'} '.json' {'application/json'}
                        default {'application/octet-stream'}
                    }
                    $resp.OutputStream.Write($bytes,0,$bytes.Length); $resp.OutputStream.Close()
                } else { Write-Text $resp 'Not found' 'text/plain' 404 }
            }
        }
        $quiet = $path -in @('/api/scan/status', '/api/login/check', '/api/play', '/api/log') -or -not $path.StartsWith('/api/')
        if (-not $quiet -or $resp.StatusCode -ge 400) {
            $extra = ''; if ($path -eq '/api/suno') { $extra = ' ' + [System.Web.HttpUtility]::ParseQueryString($req.Url.Query)['path'] }
            Log 'HTTP' ("{0} {1}{2} -> {3} ({4} ms)" -f $req.HttpMethod, $path, $extra, $resp.StatusCode, $t0.ElapsedMilliseconds)
        }
    } catch {
        Log 'ERROR' "$($req.HttpMethod) $path : $($_.Exception.Message)"
        try { Write-Json $resp @{ error="$($_.Exception.Message)" } 500 } catch {}
    }
}
$listener.Stop()
