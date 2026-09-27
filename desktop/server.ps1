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

function Clerk-Get($path) {
    $url = $Cfg.clerkBase + $path + $ClerkQS
    $h = @{ 'Authorization' = $Cfg.clientCookie; 'Cookie' = "__client=$($Cfg.clientCookie)" }
    return Invoke-RestMethod -Uri $url -Headers $h -Method Get
}
function Clerk-Post($path) {
    $url = $Cfg.clerkBase + $path + $ClerkQS
    $h = @{ 'Authorization' = $Cfg.clientCookie; 'Cookie' = "__client=$($Cfg.clientCookie)" }
    return Invoke-RestMethod -Uri $url -Headers $h -Method Post -Body ''
}
$script:AccountLabel = $null
function Get-SessionId {
    $r = Clerk-Get '/v1/client'
    $sid = $r.response.last_active_session_id
    if (-not $sid) { throw "No active session (__client cookie expired or anonymous?)" }
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
    foreach ($c in $clients) {
        $Cfg.clientCookie = $c.value; $script:Jwt = $null; $script:Sid = $null
        try { $null = Get-Jwt; Save-Config $Cfg; return @{ ok=$true; label=$script:AccountLabel } } catch {}
    }
    return @{ ok=$false; code='session_invalid' }
}

# ---- Helpers --------------------------------------------------------
function Sanitize($s) {
    if (-not $s) { return 'Untitled' }
    return ($s -replace '[\\/:*?"<>|]', '_').Trim()
}
function Read-Body($req) {
    $sr = New-Object IO.StreamReader($req.InputStream, $req.ContentEncoding)
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

# ---- Scan bibliotheque locale (id Suno depuis TSRC) -----------------
$script:ScanMap = @{}
function Scan-Library {
    $map = @{}
    if (-not $Cfg.libraryPath -or -not (Test-Path -LiteralPath $Cfg.libraryPath)) { $script:ScanMap = $map; return $map }
    Get-ChildItem -LiteralPath $Cfg.libraryPath -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in '.mp3', '.wav' } | ForEach-Object {
        $id = $null
        if ($TagLibOk) {
            try {
                $tf = [TagLib.File]::Create($_.FullName)
                $id = $tf.Tag.ISRC
                $tf.Dispose()
            } catch {}
        }
        if (-not $id) {
            # fallback : "(id8)" ou "[id]" dans le nom
            if ($_.BaseName -match '\(([0-9a-fA-F-]{8,})\)') { $id = $Matches[1] }
            elseif ($_.BaseName -match '\[([0-9a-fA-F-]{8,})\]') { $id = $Matches[1] }
        }
        if ($id) { $map[$id] = $_.FullName }
    }
    $script:ScanMap = $map
    return $map
}
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
        Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -TimeoutSec 300
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
    return @{ ok = $true; path = $out; lrc = $lrc }
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
            '^/api/scan$' {
                $map = Scan-Library
                Write-Json $resp @{ ok=$true; count=$map.Count; ids=$map }; break
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
                $id = $qp['id']
                if ($script:ScanMap.Count -eq 0) { Scan-Library | Out-Null }
                $file = $script:ScanMap[$id]
                if ($file -and (Test-Path $file)) { Stream-File $req $resp $file }
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
    } catch {
        try { Write-Json $resp @{ error="$($_.Exception.Message)" } 500 } catch {}
    }
}
$listener.Stop()
