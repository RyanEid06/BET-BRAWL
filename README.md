# BET & BRAWL

A party game for **3–9 players** with 14 minigames, tournaments, and spectator betting. **Version 2.1.0** is available on Android 7.0 and newer and in a web browser.

**[Download Android APK](https://github.com/RyanEid06/BET-BRAWL/releases/download/v2.1.0/BET-BRAWL-V2.1-2.1.0-code4.apk)** · **[Play on the web](https://bet-brawl.northstack-labs.workers.dev)** · [Latest GitHub release](https://github.com/RyanEid06/BET-BRAWL/releases/latest)

- **Android** · Open the APK and follow the install prompt. Connect everyone to the same Wi-Fi network. A host phone runs the room locally, so gameplay does not require an internet backend. Install over the existing production V2 app to retain saved data and settings.
- **Web** · Open the site, host a room, and share the room code. Players can join from different networks with internet access.

Players take turns as fighters or spectators across reaction, timing, and precision games such as Quick Draw, Millisecond Stop, and Blind Pinpoint. V2.1 adds short fighter instructions for every game.

## Source

The shared game and interface use TypeScript, React, and Vite. The [Android branch](https://github.com/RyanEid06/BET-BRAWL/tree/main) bundles the React interface in a WebView and hosts games in Kotlin. The [web branch](https://github.com/RyanEid06/BET-BRAWL/tree/v2-web) uses Cloudflare Workers and SQLite Durable Objects. The `v1` branch contains historical source.

Use Node.js 22.12 or newer and run `npm ci`. For Android, install JDK 17 and Android SDK 35, run `npm run build:android`, then run `./gradlew :app:assembleDebug` or `.\gradlew.bat :app:assembleDebug` on Windows. For local web development on `v2-web`, run `npm run cf:dev`.

Blind Pinpoint uses public-domain Natural Earth map geometry.
