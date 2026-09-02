# Deploying the web page

The page is static files. It needs no application server, no database, and no environment variables. It is hosted at **redact.boundera.io** and linked from the Boundera resources page.

## Build

```bash
pnpm install --frozen-lockfile
pnpm build:web      # writes dist-web/ with the bundle hash stamped into the footer
pnpm check:web      # refuses to pass if the page could reach the network
```

`dist-web/BUNDLE_SHA256.txt` lists the SHA-256 of every JavaScript file and the combined hash shown in the page footer.

## Host

Any static host works. The rules:

1. Serve `dist-web/` as-is at the root of the subdomain.
2. Send these response headers on every file. The page carries the same policy in a `<meta>` tag; the header is the belt to that brace.

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cache-Control: public, max-age=300
```

3. Set no cookies. Add no script. Add no analytics tag. Any script on the page can read the document a person loaded, so the page must carry none but its own.
4. Count visits from the server's access logs if you want numbers. Logs never see the document.

## Verify a deploy

```bash
curl -s https://redact.boundera.io/BUNDLE_SHA256.txt
curl -s https://redact.boundera.io/assets/<file>.js | shasum -a 256
```

The served hashes must equal the release's `BUNDLE_SHA256.txt`, and the combined hash must equal the one in the page footer. Then open the page, load the example, disconnect from the network, and redact again: it must still work.
