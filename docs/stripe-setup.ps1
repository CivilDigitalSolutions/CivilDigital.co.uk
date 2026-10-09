# Creates the App Testing products and prices in whichever Stripe account the CLI is logged in to,
# and prints the price IDs as lines for firebase/functions/.env. Pass -Live for live mode.
# Checkout itself is created per booking by the intake function, so no Payment Links are made here.
param([switch]$Live)
$ErrorActionPreference = "Stop"
$stripe = (Get-Command stripe -EA SilentlyContinue).Source
if (-not $stripe) { $stripe = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter stripe.exe | Select -First 1 -Expand FullName }
$mode = @(); if ($Live) { $mode = @("--live") }

function Post($path, [string[]]$params) {
  $cliArgs = @("post", $path) + $mode
  foreach ($p in $params) { $cliArgs += @("-d", $p) }
  # The CLI prints banners on stderr, which PowerShell 5.1 turns into errors under "Stop"
  $ErrorActionPreference = "Continue"
  $out = & $stripe @cliArgs 2>$null | Out-String
  $ErrorActionPreference = "Stop"
  $obj = $out | ConvertFrom-Json
  if ($obj.error) { throw "$path failed: $($obj.error.message)" }
  return $obj
}

$items = @(
  @{ env="PRICE_QUICK_CHECK";   name="Quick Check";           pence=1900; desc="One 10 to 15 minute hands-on session covering sign-in, the main screens and the most important features. Testing Feedback report (PDF and Word)." },
  @{ env="PRICE_FEATURE_TEST";  name="Focused Feature Test";  pence=2900; desc="One named journey tested end to end, including when it is done wrongly or abandoned halfway, written up step by step." },
  @{ env="PRICE_EXTRA_JOURNEY"; name="Extra journey";         pence=1200; desc="Each additional journey for a Focused Feature Test." },
  @{ env="PRICE_ROLLING";       name="Rolling Daily Testing"; pence=3900; desc="Daily visits for up to 16 days from your Play testing track, with daily feedback to your inbox and a running log." },
  @{ env="PRICE_LAUNCH_PACK";   name="Launch Pack";           pence=6900; desc="A Quick Check, one Focused Feature Test and Rolling Daily Testing." },
  @{ env="";                    name="Fix re-check";          pence=500;  desc="Re-check of a fixed problem after the free re-check (within 14 days of the report) has been used." }
)

foreach ($i in $items) {
  $product = Post "/v1/products" @("name=$($i.name)", "description=$($i.desc)", "statement_descriptor=CIVIL DIGITAL TESTING")
  $price = Post "/v1/prices" @("product=$($product.id)", "currency=gbp", "unit_amount=$($i.pence)")
  if ($i.env) { "$($i.env)=$($price.id)" } else { "# $($i.name): $($price.id)" }
}
