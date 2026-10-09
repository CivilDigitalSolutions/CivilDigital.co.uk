# Creates App Testing products, prices and Payment Links in whichever Stripe account the CLI is logged in to.
# Pass -Live to target live mode (the CLI then uses its live key).
param([switch]$Live)
$ErrorActionPreference = "Stop"
$stripe = (Get-Command stripe -EA SilentlyContinue).Source; if (-not $stripe) { $stripe = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter stripe.exe | Select -First 1 -Expand FullName }
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

$terms = "https://civildigital.co.uk/app-testing/terms/"
$thanks = "https://civildigital.co.uk/app-testing/thank-you/"
$consent = "I agree to the [service terms]($terms) and ask Civil Digital to start straight away. I understand the right to cancel ends once the report is delivered."
$full = "This option is full at the moment. Email info@civildigital.co.uk to join the waiting list."

$items = @(
  @{ key="QUICK_CHECK";   option="quick-check";   name="Quick Check";           pence=1900; desc="One 10 to 15 minute hands-on session covering sign-in, the main screens and the most important features. Testing Feedback report (PDF and Word)." },
  @{ key="FEATURE_TEST";  option="feature-test";  name="Focused Feature Test";  pence=2900; desc="One named journey tested end to end, including when it is done wrongly or abandoned halfway, written up step by step." },
  @{ key="EXTRA_JOURNEY"; option="extra-journey"; name="Extra journey";         pence=1200; desc="Each additional journey for a Focused Feature Test."; adjustable=$true },
  @{ key="ROLLING";       option="rolling";       name="Rolling Daily Testing"; pence=3900; desc="Daily visits for up to 16 days from your Play testing track, with one sentence of feedback a day and a running log."; limit=5 },
  @{ key="LAUNCH_PACK";   option="launch-pack";   name="Launch Pack";           pence=6900; desc="A Quick Check, one Focused Feature Test and Rolling Daily Testing."; limit=5 },
  @{ key="RECHECK";       option="";              name="Fix re-check";          pence=500;  desc="Re-check of a fixed problem after the free re-check (within 14 days of the report) has been used." }
)

$results = @()
foreach ($i in $items) {
  $product = Post "/v1/products" @("name=$($i.name)", "description=$($i.desc)", "metadata[cd_key]=$($i.key)", "statement_descriptor=CIVIL DIGITAL TESTING")
  $price = Post "/v1/prices" @("product=$($product.id)", "currency=gbp", "unit_amount=$($i.pence)", "tax_behavior=unspecified")

  $redirect = if ($i.option) { "$($thanks)?option=$($i.option)" } else { $thanks }
  $p = @(
    # No custom fields: app details are collected on /app-testing/book/ before payment,
    # and the page adds ?client_reference_id=<booking ref>&prefilled_email=<email> to the link.
    "line_items[0][price]=$($price.id)", "line_items[0][quantity]=1",
    "consent_collection[terms_of_service]=required",
    "custom_text[terms_of_service_acceptance][message]=$consent",
    "after_completion[type]=redirect", "after_completion[redirect][url]=$redirect",
    "metadata[cd_key]=$($i.key)"
  )
  if ($i.adjustable) { $p += @("line_items[0][adjustable_quantity][enabled]=true", "line_items[0][adjustable_quantity][minimum]=1", "line_items[0][adjustable_quantity][maximum]=10") }
  if ($i.limit) { $p += @("restrictions[completed_sessions][limit]=$($i.limit)", "inactive_message=$full") }
  $link = Post "/v1/payment_links" $p
  $results += [pscustomobject]@{ key=$i.key; product=$product.id; price=$price.id; amount=$i.pence; link=$link.url; limit=$i.limit }
}
$results | Format-Table -AutoSize | Out-String -Width 250
