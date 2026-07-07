# FarmFlow Support Site

Static, dependency-free branch site for the FarmFlow Android app, designed to sit alongside (but look nothing like) civildigital.co.uk. All pages are plain HTML + one shared stylesheet — no build step, no JS required.

## Structure

```
farmflow-site/
├── index.html                  # Tile-grid home page
├── help.html                   # Help & Support hub
├── faqs.html                   # FAQs (accordion via <details>)
├── contact.html                # Contact support
├── privacy.html                # Privacy Policy (Play Console URL)
├── terms.html                  # Terms & Conditions
├── prohibited-items.html       # Prohibited Items Policy
├── safety.html                 # Buyer & seller safety tips
├── community-guidelines.html   # Moderation policy & appeals
├── account-deletion.html       # Account & data deletion (Play REQUIRED URL)
├── verified-sellers.html       # Verified Seller Programme
└── assets/
    └── farmflow.css            # Shared stylesheet (all brand tokens in :root)
```

## Integration into the existing repo

- **Recommended host**: `farmflow.civildigital.co.uk` (subdomain) so the site reads as its own product. A subdirectory (`civildigital.co.uk/farmflow/`) also works — all internal links are relative, so the folder can be dropped anywhere.
- Do **not** import any Civil Digital CSS, headers, or nav. The single shared element is the footer line "FarmFlow is operated by Civil Digital".
- Fonts are loaded from Google Fonts (Bricolage Grotesque + Nunito Sans). If self-hosting fonts is preferred, download the two families and update the `<link>` tags and CSS `font-family` stacks.
- The logo is currently a simplified inline SVG recreation. Replace with the real FarmFlow logo asset (SVG or PNG) in `index.html` (`.mark`) when available.

## Placeholders to replace (find & replace across all files)

| Token | Meaning |
|---|---|
| `{{SUPPORT_EMAIL}}` | Support email address |
| `{{WHATSAPP_NUMBER}}` | WhatsApp number in international format, digits only |
| `{{SUPPORT_HOURS}}` | e.g. "Mon–Fri, 9am–5pm (Jamaica time)" |
| `{{PLAY_STORE_URL}}` | Full Play Store listing URL |
| `{{EFFECTIVE_DATE}}` | Effective date for legal pages |
| `{{POLICY_VERSION}}` / `{{TERMS_VERSION}}` | Version identifiers (keep versioned — matches the app's consent-wording versioning discipline) |
| `{{BUSINESS_ADDRESS}}` | Civil Digital's registered address |
| `{{RETENTION_DAYS}}` | Days to complete deletion (e.g. 30) |
| `{{DELETION_SLA_DAYS}}` | SLA for web-initiated deletion requests |
| `{{FINANCE_RETENTION}}` / `{{ENFORCEMENT_RETENTION}}` / `{{KYC_RETENTION}}` | Retention periods for retained records |
| `{{GOVERNING_LAW_JURISDICTION}}` | Jurisdiction for the Terms |
| `{{FEE_IDENTITY}}` / `{{FEE_CATEGORY}}` / `{{FEE_RENEWAL}}` | Verified Seller fees (or "Contact us for pricing" until set) |

## Play Console wiring (important)

Once deployed, these URLs go into Play Console:

1. **Privacy policy URL** → `privacy.html`'s final URL (Store listing + Data Safety form). Lock this path before submitting; changing it later means re-review.
2. **Account deletion URL** → `account-deletion.html`'s final URL (Data Safety → Data deletion). Google requires this page to be reachable without the app and to describe both deletion steps and retained data — both are included.
3. The retained-data table in `account-deletion.html` and the collection table in `privacy.html` must stay consistent with the Data Safety form answers. Update all three together.

## Content notes

- **Legal drafts**: `privacy.html` and `terms.html` are structured drafts tailored to the actual stack (Firebase, Play Billing donations, off-app boost/verification payments via Stripe, AdMob, coarse location, 18+ marketplace, Jamaica & T&T DPAs). Have them reviewed by a lawyer before launch.
- **Boost language**: boost acquisition/payment language lives here on the web deliberately, and only describes contacting the team — consistent with the app-side string-audit discipline (no purchase language in-app).
- **AdMob**: the privacy policy discloses AdMob with "may show advertising" so the page is accurate whether the `config/ads` flag is on or off.
- **Verified Sellers**: category checklists mirror the phased rollout (machinery → livestock → meat) with status badges; update badges as phases launch.

## Quality floor

Responsive to mobile, keyboard-focus visible on tiles, `prefers-reduced-motion` respected, semantic headings, no JavaScript dependencies. FAQ accordions use native `<details>`.
