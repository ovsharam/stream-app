# Notch macOS build assets

Optional: add `icon.icns` (512×512+) here for a custom Dock icon.

Without `icon.icns`, electron-builder uses the default Electron icon.

```bash
# Example: convert a PNG to icns (macOS)
mkdir icon.iconset
sips -z 512 512 ../path/to/logo.png --out icon.iconset/icon_512x512.png
# … other sizes, then:
iconutil -c icns icon.iconset -o icon.icns
```
