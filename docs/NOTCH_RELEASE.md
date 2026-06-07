# Notch release & appliedscope.com download

Ship a macOS `.dmg` / `.zip` and link it from **https://appliedscope.com/download**.

## 1. Build locally

Requires Node 20+, Xcode CLI tools (for native modules), and dependencies installed:

```bash
npm install
npm run pack:notch:mac
```

Artifacts land in `release/dist/`:

- `Notch-{version}-mac-arm64.dmg` (Apple Silicon)
- `Notch-{version}-mac-x64.dmg` (Intel, if built on Intel or with `--x64`)
- Matching `.zip` files

The prepare step bundles the API into `release/server/` and copies it into the app via `extraResources`.

## 2. Host the binary

Vercel is not ideal for large binaries (~100MB+). Pick one:

| Option | Steps |
|--------|--------|
| **GitHub Releases** | Tag `v0.3.0`, upload `.dmg`, copy the asset URL |
| **Cloudflare R2 / S3** | Upload with public read, note the HTTPS URL |
| **Vercel Blob** | Upload via dashboard or `@vercel/blob` |

Use a stable URL (redirect or versioned path). Example:

`https://releases.appliedscope.com/notch/Notch-0.3.0-mac-arm64.dmg`

## 3. Configure appliedscope.com

### Vercel project

1. Point **appliedscope.com** DNS to Vercel (A/CNAME as in Vercel dashboard).
2. Set environment variables:

```env
APP_URL=https://appliedscope.com
NEXT_PUBLIC_NOTCH_DOWNLOAD_MAC=https://your-cdn/notch/Notch-0.3.0-mac-arm64.dmg
```

3. Deploy. The download page is at **`/download`**.

Optional: add a redirect so `appliedscope.com` → `/download` if this repo is the marketing site only.

### vercel.json example (production)

```json
{
  "framework": "nextjs",
  "env": {
    "APP_URL": "https://appliedscope.com",
    "NEXT_PUBLIC_NOTCH_DOWNLOAD_MAC": "https://releases.appliedscope.com/notch/Notch-latest.dmg"
  }
}
```

Remove demo-only vars (`DEMO_MODE`, `NEXT_PUBLIC_INTERACTIVE_DEMO`) for the production marketing deploy if you do not need the web demo on that domain.

## 4. Code signing (recommended)

Unsigned builds trigger Gatekeeper warnings. For smooth installs:

1. Enroll in [Apple Developer Program](https://developer.apple.com/programs/).
2. Create **Developer ID Application** certificate.
3. Set in CI or locally before pack:

```bash
export CSC_LINK=path/to/certificate.p12
export CSC_KEY_PASSWORD=...
export APPLE_ID=...
export APPLE_APP_SPECIFIC_PASSWORD=...
export APPLE_TEAM_ID=...
npm run pack:notch:mac
```

electron-builder will sign and notarize when credentials are present (`hardenedRuntime` + entitlements are already configured in `build/entitlements.mac.plist`).

## 5. User data

Packaged Notch uses the same data directory as dev unless you set `STREAM_DATA_DIR`:

`~/.stream-app/` (SQLite, OAuth tokens, KB)

## 6. CI sketch (GitHub Actions)

```yaml
- run: npm ci
- run: npm run pack:notch:mac
- uses: softprops/action-gh-release@v2
  with:
    files: release/dist/*.dmg
```

Then update `NEXT_PUBLIC_NOTCH_DOWNLOAD_MAC` to the new release asset URL (or use a stable “latest” redirect).

## Troubleshooting

- **API fails on launch**: Check Console.app for `[api]` logs; ensure `release/server/index.js` exists inside the `.app` → Contents/Resources/server/.
- **better-sqlite3 errors**: Run `npm rebuild better-sqlite3` before pack; native module is copied into the bundle.
- **Blank window**: Confirm `notch/dist-renderer` was built (`npm run prepare:notch-release` runs this automatically).
