# Promotional graphics: adding examples

The Examples section on `/services/social-media-graphics/` is written but **commented out** in
`services/social-media-graphics/index.html` (search for `EXAMPLES SECTION`). It stays hidden until there
are approved examples, so the page never shows placeholders to visitors.

## Before adding an example

- Use your own work, a self-initiated demonstration piece, or client work **with written permission**
  to publish it (keep the permission with the project records).
- Remove or replace personal details: phone numbers, addresses, names and faces, unless permitted.
- Never invent a client, a result or a testimonial. If a piece is a demonstration rather than client
  work, say so in the caption (for example "Demonstration piece for a fictional electrician").
- Show what the graphic needed to do and the decisions made. Don't mock anyone's original design; if
  you show a "before", use your own mock-up, not a real business's graphic.

## Suggested first three

1. A promotional post for an electrician (or another trade).
2. A special offer for a local service business.
3. An event poster for a community organisation.

## How to add one

1. Export the image as WebP (or JPEG) at the size it is shown, about 1080 px wide, under 200 KB.
   Name it descriptively, for example `images/examples/electrician-facebook-post.webp`.
2. In the commented-out section, copy one `<article class="card">` per example and fill in:
   - `src`, `width` and `height` (the real pixel size, to stop the layout jumping);
   - `alt`: what the graphic shows **and the text it contains**, for example
     "Facebook post for an electrician: 'EV charger installation, book a free survey', with a phone number";
   - the title, **The problem** and **What we did**.
3. Remove the `<!--` and `-->` markers around the section.
4. Update the page's `<lastmod>` in `sitemap.xml`.
