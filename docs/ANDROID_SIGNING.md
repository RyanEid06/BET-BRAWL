# Permanent Android release signing

Production identity: RSA4096 / SHA256withRSA, alias betbrawl-release, certificate valid10000days. Public certificate SHA-256:

`222a2459a560c966ab30ebc7a03d60008a5614692e84e726b7f1568f60caef51`

The public pin is committed as app/release-signing.sha256. CI independently verifies the signed APK against it. This is a dedicated release identity, separate from all historical debug keys. Keep it for every future update; increment versionCode beyond3. The current APK package remains com.betbrawl.app.

The owner explicitly authorized storing the key/passwords as encrypted GitHub Actions secrets in RyanEid06/BET-BRAWL. The workflow consumes ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD, writes a restricted temporary store and deletes it after building. Release assembly fails if permanent signing is absent; unsigned release artifacts are not published.

A restricted local copy lives at C:/Users/Administrator/.android/bet-brawl-release/bet-brawl-release.p12. Its matching credentials.xml uses Windows current-user DPAPI; its directory ACL grants only the current Windows identity access. Keep both files private and retain a secure owner-controlled backup/recovery plan. They are outside the repository and never included in APKs or test artifacts. CI encrypted secrets retain the same identity independently.

scripts/prepare-android-signing.ps1 checks/reuses this identity. Its -Create option is only for the initial authorized creation; it never overwrites an existing or incomplete store. Secret upload requires explicit owner authorization; values travel through stdin and are never printed. Do not regenerate the key to resolve a failed build.

For a local signed build on this Windows account, use scripts/build-android-release.ps1 from a clean checkout with SDK35/JDK17 installed. It reads the intended protected local credential, passes signing via process environment, and clears that environment afterward. CI is the primary verified release build path.

Old debug/test APKs used other certificates and cannot be updated in place with this release identity. The owner must back up anything needed before manually replacing an old debug installation; uninstalling erases app data. This workflow never uninstalls or modifies a physical phone. Future production APKs signed with this permanent identity can update this release normally.
