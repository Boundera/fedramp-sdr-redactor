# Deploying the web page

The page is static files. It needs no application server, no database, and no environment variables. It is served at **https://tools.boundera.io/sdr-redactor/** and linked from the Boundera resources page.

## The host rule

`tools.boundera.io` is the home of every Boundera tool that must never see the user's data. One rule covers the whole host:

- Static files only. No application server, no cookies, no third-party script, no analytics tag.
- One strict Content Security Policy header, set once at the host for every path.
- One tool per path prefix. The host root serves a short index of tools.

A tool that needs a server, analytics, or an email gate does not belong here. It goes on boundera.io.

## Build

```bash
pnpm install --frozen-lockfile
pnpm build:web      # writes dist-web/ with asset paths under /sdr-redactor/ and the bundle hash in the footer
pnpm check:web      # refuses to pass if the page could reach the network
```

`dist-web/BUNDLE_SHA256.txt` lists the SHA-256 of every JavaScript file and the combined hash shown in the page footer.

## Host

The host itself, bucket, distribution, headers, and deploy roles, is defined in the public repository [Boundera/tools-site](https://github.com/Boundera/tools-site). This repository only deploys into its prefix: the `deploy` workflow runs on a `v*` tag, assumes the role that repository defines, syncs `dist-web/` to `sdr-redactor/`, invalidates the cache, and verifies the live hashes. It needs three Actions variables, copied from the tools-site outputs: `AWS_DEPLOY_ROLE_ARN`, `S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`.

The layout any static host must reproduce:

1. Copy `dist-web/` to the `sdr-redactor/` prefix of the host, so `dist-web/index.html` is served at `/sdr-redactor/index.html` and `/sdr-redactor/`.
2. Redirect `/sdr-redactor` (no trailing slash) to `/sdr-redactor/`.
3. Send these response headers on every path of the host. The page carries the same policy in a `<meta>` tag; the header is the belt to that brace, and it is what makes the rule hold for every tool at once.

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cache-Control: public, max-age=300
```

4. Count visits from the host's access logs if you want numbers. Logs never see the document.

## Verify a deploy

```bash
curl -s https://tools.boundera.io/sdr-redactor/BUNDLE_SHA256.txt
curl -s https://tools.boundera.io/sdr-redactor/assets/<file>.js | shasum -a 256
curl -sI https://tools.boundera.io/sdr-redactor/ | grep -i content-security-policy
```

The served hashes must equal the release's `BUNDLE_SHA256.txt`, the combined hash must equal the one in the page footer, and the policy header must be present. Then open the page, load the example, disconnect from the network, and redact again: it must still work.
