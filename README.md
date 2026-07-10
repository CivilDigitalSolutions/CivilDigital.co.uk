# Live Website - CivilDigital.co.uk

Production static site for **civildigital.co.uk**, published with GitHub Pages.
The repository root **is** the website root (no build step).

## Publish (GitHub Pages, deploy from root)

1. Create/point a GitHub repo and push this branch (`main`).
2. **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)`**.
3. **Settings → Pages → Custom domain:** `civildigital.co.uk` (already pinned by the `CNAME` file).
4. **DNS** at your registrar for the apex domain — add GitHub Pages' records:
   - `A` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `AAAA` → `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - (optional) `www` as `CNAME` → `<github-user>.github.io`
5. Enable **Enforce HTTPS** once the certificate provisions.

## FarmFlow (moved to subdomain)

The FarmFlow support site now lives in its own repo, published at
**farmflow.civildigital.co.uk**. Legacy `/farmflow/...` URLs are forwarded there by the
router in `404.html` (listing links `/farmflow/listing/{id}` become `/listing/?id={id}`).

## `.well-known/assetlinks.json`

Android App Links verification for the FarmFlow app's password-reset deep link
(`https://civildigital.co.uk/farmflow/auth/reset-complete`). Even though the FarmFlow site
moved to the subdomain, the app's intent filter still verifies against **this** domain, so the
file must stay reachable at `https://civildigital.co.uk/.well-known/assetlinks.json` returning
HTTP 200 with no redirect until the app's deep links are migrated. A copy also ships with the
subdomain repo — keep both `sha256_cert_fingerprints` arrays in sync.
Before the FarmFlow Play release, add the Play App Signing key SHA-256 to its
`sha256_cert_fingerprints` array (currently it holds only the debug key).
