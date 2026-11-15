# =============================================================================
# ASTRA · configuración del servidor de IA (Cloudflare Worker)
# Se ejecuta con configurar-astra.bat (en la carpeta principal del proyecto).
# IA por defecto: Workers AI de Cloudflare (gratis, sin clave).
# Opcional: una clave de Anthropic de pago, que se escribe solo dentro de wrangler
# (oculta) y queda como secreto de Cloudflare: este script nunca la ve ni la guarda.
# =============================================================================
$ErrorActionPreference = 'Continue'
$servidor = $PSScriptRoot
$raiz = (Resolve-Path (Join-Path $servidor '..\..')).Path
$dataContext = Join-Path $raiz 'chatbot\js\data-context.js'
$origenWeb = 'https://reevyx.github.io'
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Titulo($t) { Write-Host ''; Write-Host $t -ForegroundColor White }
function Paso($n, $t) { Write-Host ''; Write-Host "[$n/7] $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "   OK  $t" -ForegroundColor Green }
function Aviso($t) { Write-Host "   !   $t" -ForegroundColor Yellow }
function Fallo($t) { Write-Host ''; Write-Host "   X   $t" -ForegroundColor Red; Write-Host ''; exit 1 }
function Pregunta($t) { $r = Read-Host "   ?   $t (s/n)"; return ($r -match '^(s|si|sí|y|yes)$') }

Titulo '=== ASTRA · configuración del servidor de IA ==='
Write-Host 'Este asistente publica el servidor de IA de ASTRA y conecta la web con él.'
Write-Host 'Necesitas: Node.js y una cuenta gratuita de Cloudflare. No hace falta pagar ni ninguna clave.'

# 1) Node.js -------------------------------------------------------------------
Paso 1 'Comprobando Node.js'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fallo 'No se encontró Node.js. Instálalo desde https://nodejs.org (versión LTS) y vuelve a ejecutar este archivo.' }
Ok ("Node.js " + (node --version))
Set-Location $servidor

# 2) Dependencias ----------------------------------------------------------------
Paso 2 'Instalando las dependencias del servidor'
npm install --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { Fallo 'npm install falló. Revisa tu conexión a internet.' }
Ok 'Dependencias instaladas'
$auditoria = cmd /c "npm audit --omit=dev 2>&1" | Out-String
if ($auditoria -match 'found 0 vulnerabilities') { Ok 'Sin vulnerabilidades conocidas en las dependencias' }
else { Aviso 'npm audit encontró avisos en las dependencias:'; Write-Host $auditoria }

# 3) Sesión de Cloudflare ----------------------------------------------------------
Paso 3 'Sesión de Cloudflare'
$quien = cmd /c "npx wrangler whoami 2>&1" | Out-String
if ($quien -match 'not authenticated|wrangler login') {
  Write-Host '   Se abrirá el navegador para que entres en tu cuenta de Cloudflare.'
  npx wrangler login
  if ($LASTEXITCODE -ne 0) { Fallo 'No se pudo iniciar sesión en Cloudflare.' }
}
Ok 'Sesión de Cloudflare activa'

# 4) Publicar el servidor ----------------------------------------------------------
Paso 4 'Publicando el servidor'
$lineas = New-Object System.Collections.Generic.List[string]
cmd /c "npx wrangler deploy 2>&1" | ForEach-Object { Write-Host "   $_"; $lineas.Add([string]$_) }
$codigo = $LASTEXITCODE
$url = ([regex]::Match(($lineas -join "`n"), 'https://[A-Za-z0-9.-]+\.workers\.dev')).Value
if ($codigo -ne 0 -or -not $url) {
  Aviso 'La publicación necesita que respondas algo (por ejemplo, elegir tu subdominio workers.dev). Repito en modo interactivo:'
  npx wrangler deploy
  if ($LASTEXITCODE -ne 0) { Fallo 'No se pudo publicar el servidor.' }
  $url = (Read-Host '   ?   Copia aquí la dirección https://....workers.dev que apareció arriba').Trim()
}
if ($url -notmatch '^https://[A-Za-z0-9.-]+\.workers\.dev/?$') { Fallo "La dirección '$url' no parece de workers.dev." }
$url = $url.TrimEnd('/')
Ok "Servidor publicado en $url"

# 5) IA: Workers AI (gratis) y, opcionalmente, Claude con clave de pago ------------------
Paso 5 'Eligiendo la IA'
Ok 'ASTRA usa Workers AI de Cloudflare: gratis (cuota diaria) y sin ninguna clave'
$secretos = cmd /c "npx wrangler secret list 2>&1" | Out-String
if ($secretos -match 'ANTHROPIC_API_KEY') {
  Ok 'También hay una clave de Anthropic guardada como secreto: se usa Claude y, si falla, Workers AI'
} elseif (Pregunta 'Opcional: ¿tienes una clave de Anthropic CON SALDO y quieres usar Claude? (si no pagas, responde n)') {
  Write-Host '   Pega tu clave de Anthropic cuando wrangler la pida. No se verá en pantalla y no se guarda en ningún archivo.'
  npx wrangler secret put ANTHROPIC_API_KEY
  if ($LASTEXITCODE -ne 0) { Aviso 'No se guardó la clave; ASTRA seguirá con Workers AI.' }
  else { Ok 'Clave guardada como secreto (solo la conoce el servidor)' }
} else { Ok 'Sin clave de pago: nada que guardar ni que proteger' }

# 6) Conectar la web --------------------------------------------------------------
Paso 6 'Conectando la web con el servidor'
$txt = [IO.File]::ReadAllText($dataContext, $utf8)
$txt = $txt -replace 'usarApiExterna:\s*(true|false)', 'usarApiExterna: true'
$txt = $txt -replace 'endpoint:\s*"[^"]*"', ('endpoint: "' + $url + '"')
[IO.File]::WriteAllText($dataContext, $txt, $utf8)
Ok 'chatbot/js/data-context.js apunta al servidor (sin ninguna clave)'

if (Pregunta '¿Probar el servidor con un mensaje corto? (gratis: usa un poco de la cuota diaria)') {
  try {
    $cuerpo = [Text.Encoding]::UTF8.GetBytes('{"mensaje":"Hola, preséntate en una sola frase."}')
    $r = Invoke-RestMethod -Method Post -Uri $url -Headers @{ Origin = $origenWeb } -ContentType 'application/json; charset=utf-8' -Body $cuerpo -TimeoutSec 60
    Ok ("ASTRA responde: " + $r.respuesta)
  } catch { Aviso ("La prueba falló: " + $_.Exception.Message + ". Espera un minuto y vuelve a ejecutar este archivo; mientras tanto ASTRA usa sus respuestas locales.") }
}

# 7) Protección contra filtraciones -------------------------------------------------
Paso 7 'Protección para que ninguna clave llegue a GitHub'
$hookDir = Join-Path $raiz '.git\hooks'
if (Test-Path $hookDir) {
  $hook = Join-Path $hookDir 'pre-commit'
  $marca = '# icewise: bloquea claves de API'
  $contenido = @(
    '#!/bin/sh',
    $marca,
    '# Impide hacer commit si los cambios contienen algo que parece una clave de API.',
    'if git diff --cached -U0 | grep -E "^\+.*(sk-ant-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{32,}|AIza[0-9A-Za-z_-]{35})" >/dev/null; then',
    '  echo "BLOQUEADO: parece que vas a subir una clave de API. Quitala del archivo y vuelve a intentarlo."',
    '  echo "(Si de verdad no es una clave: git commit --no-verify)"',
    '  exit 1',
    'fi',
    'exit 0'
  ) -join "`n"
  if ((Test-Path $hook) -and -not ((Get-Content $hook -Raw) -match [regex]::Escape($marca))) {
    Aviso 'Ya existe otro pre-commit en .git/hooks; no lo toco.'
  } else {
    [IO.File]::WriteAllText($hook, $contenido + "`n", $utf8)
    Ok 'git bloqueará cualquier commit que contenga una clave de API'
  }
} else { Aviso 'No se encontró la carpeta .git; se omite este paso.' }

$fugas = Get-ChildItem -Path $raiz -Recurse -File -Include *.js, *.html, *.json, *.toml, *.md -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\\.git\\|\\\.wrangler\\' } |
  Select-String -Pattern 'sk-ant-[A-Za-z0-9_-]{16,}' -List
if ($fugas) { Aviso 'Se encontró algo parecido a una clave en estos archivos. Quítala y revócala en console.anthropic.com:'; $fugas | ForEach-Object { Write-Host "      $($_.Path)" } }
else { Ok 'No hay claves en los archivos del proyecto' }

Titulo '=== Listo ==='
Write-Host 'Siguientes pasos:'
Write-Host '  1. Sube los cambios a GitHub (el archivo data-context.js ya tiene la dirección del servidor).'
Write-Host '  2. Abre la web en GitHub Pages y habla con ASTRA (por texto o por voz).'
Write-Host '  3. Si algún día usas una clave de Anthropic de pago, ponle un límite de gasto en console.anthropic.com.'
Write-Host ''
