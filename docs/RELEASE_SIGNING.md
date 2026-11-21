# Release signing

By default the Atlas APK built by "Atlas native-image experimental APK" is signed with the
debug key in `android/app/debug.keystore`. That key is public in the repository, so anyone
can build an APK that Android treats as an update to yours. To sign with a key only you hold,
add four GitHub secrets. The workflow picks them up on the next run. Without them the build
still works and keeps the debug signing.

## 1. Create the key (once, on your computer)

Needs a JDK (`keytool`).

```
keytool -genkeypair -v -storetype PKCS12 \
  -keystore atlas-release.jks -alias atlas \
  -keyalg RSA -keysize 4096 -validity 10000
```

It asks for a keystore password, then your name details, then a key password (press Enter to
reuse the keystore password). Keep `atlas-release.jks` and both passwords somewhere safe
outside the repository, for example a password manager plus an offline copy. If you lose the
key, you can never ship an update that installs over the old one.

Never commit the `.jks` file.

## 2. Add the four secrets

GitHub > coolchan03/Atlas > Settings > Secrets and variables > Actions > New repository secret.

| Secret | Value |
|---|---|
| `ATLAS_KEYSTORE_BASE64` | the keystore as one line: `base64 -w0 atlas-release.jks` (macOS: `base64 -i atlas-release.jks`) |
| `ATLAS_KEYSTORE_PASSWORD` | the keystore password |
| `ATLAS_KEY_ALIAS` | `atlas` (the alias used above) |
| `ATLAS_KEY_PASSWORD` | the key password |

All four must exist. If any is missing the build silently falls back to debug signing. The
workflow log says which one it used ("Release signing key found." or "No release signing
secrets; using debug signing."), and the last check prints the certificate the APK was
signed with.

## 3. Warning: switching keys needs one uninstall and reinstall

Android refuses to install an APK over an app signed with a different key. The first APK
signed with your new key therefore cannot update the one on your phone, which is signed with
the debug key. You have to uninstall Atlas and install the new APK. Uninstalling deletes
chats, projects, settings and downloaded models.

Before you switch:

1. Make an encrypted backup in the app (Settings > Backup) and copy it off the phone.
2. Uninstall Atlas, install the new APK, restore the backup.
3. Re-download models if you did not back them up.

After that, every build signed with the same key updates in place. Do this once, then keep
the same key forever.

## How it works

- `.github/workflows/atlas-native-image.yml` decodes `ATLAS_KEYSTORE_BASE64` into a temporary
  file and exports `ATLAS_KEYSTORE_FILE`, `ATLAS_KEYSTORE_PASSWORD`, `ATLAS_KEY_ALIAS`,
  `ATLAS_KEY_PASSWORD` for the Gradle step.
- `android/app/build.gradle` reads those variables (or the Gradle properties
  `OFFGRID_UPLOAD_STORE_FILE` and friends for local builds). If no key is present the release
  build type uses the debug signing config.
