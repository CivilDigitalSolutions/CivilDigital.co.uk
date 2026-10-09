# Civil Digital Services: Firebase

One HTTPS Cloud Function, `intake`, in `europe-west2` (London). It receives the App Testing thank-you
page form, checks it, and emails it via **Resend**: the details go to info@civildigital.co.uk (reply-to set
to the customer) and a short confirmation goes to the customer (reply-to info@). **Nothing is stored.**

Spam protection: an origin check (only `https://civildigital.co.uk`), a honeypot field, a 20 KB body
limit, strict field validation, and a rate limit of 5 submissions per IP per 15 minutes. The rate limit is
held in memory per function instance, and `maxInstances` is 2, so no database is needed.

> This folder sits in the website repo, so GitHub Pages also serves these source files. They contain no
> secrets: the Resend key lives in Firebase Secret Manager, and `*.local` files are git-ignored.

## One-off setup

1. Create the Firebase project for services (Blaze plan, which Cloud Functions require). Put its ID in
   `firebase/.firebaserc` (currently `civil-digital`).
2. **Resend:** add and verify the `civildigital.co.uk` domain (it gives you DNS records to add), then create
   an API key with *Sending access* only.
3. Store the key as a secret (it prompts for the value, so the key never goes in a file):
   ```
   cd firebase
   firebase functions:secrets:set RESEND_API_KEY
   ```
4. The sender defaults to `Civil Digital <bookings@civildigital.co.uk>`. To change it, add
   `MAIL_FROM=...` to `firebase/functions/.env` (it must be on the verified domain).

## Deploy (after the secret is set)

```
cd firebase/functions
npm install
npm test
npm run deploy
```

The deploy output prints the function URL, for example
`https://europe-west2-<project-id>.cloudfunctions.net/intake`. Paste it over `INTAKE_ENDPOINT_URL` in
`assets/js/app-testing-config.js` and push the site. Until then, the form opens the visitor's email app.

## Test locally

`npm test` runs the unit tests. To exercise the real page against the emulator without sending real email:

- `functions/.secret.local`: `RESEND_API_KEY=anything`
- `functions/.env.local`: `RESEND_API_BASE=http://127.0.0.1:8787`, pointing at a fake Resend that just
  records requests (only honoured in the emulator)
- `npm run serve`, then post from `http://localhost:8080` (allowed as an origin only in the emulator) to
  `http://127.0.0.1:5001/demo-civil-digital-services/europe-west2/intake`
