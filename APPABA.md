# AppAba — Technical Overview

## What is AppAba?

AppAba is a **mobile-first mini-app platform** that lets users discover, run, and create native-feeling apps directly on their Android device — without installing them from an app store.

The core insight: a pre-compiled Capacitor host app acts as a universal runtime. Mini-apps are single HTML files that load into a sandboxed iframe and get full access to device hardware (GPS, camera, haptics, etc.) through a postMessage bridge. No compilation, no app store review, no APK per mini-app.

---

## Architecture

```
┌─────────────────────────────────────────┐
│           AppAba Android Host (APK)     │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │   React UI (Capacitor WebView)  │    │
│  │                                 │    │
│  │  AppListScreen                  │    │
│  │  AppViewerScreen ──────────┐    │    │
│  │  VibeCodingScreen          │    │    │
│  │  SettingsScreen            ▼    │    │
│  │                    ┌──────────┐ │    │
│  │                    │  iframe  │ │    │
│  │                    │ mini-app │ │    │
│  │                    │  HTML+JS │ │    │
│  │                    └────┬─────┘ │    │
│  └─────────────────────────┼───────┘    │
│                            │            │
│         postMessage bridge │            │
│                            ▼            │
│  ┌─────────────────────────────────┐    │
│  │     Capacitor Plugin Registry   │    │
│  │  Geolocation / Camera / Haptics │    │
│  │  Share / Clipboard / Toast      │    │
│  │  Device / Network / Preferences │    │
│  │  Shortcut / Widget              │    │
│  └─────────────────────────────────┘    │
│                            │            │
│                            ▼            │
│         Native Android APIs (Java)      │
└─────────────────────────────────────────┘
```

---

## Components

### 1. AppAba Host App (Android)

The pre-compiled APK that every user installs once. Built with Capacitor 6 + React. It contains:

- A full plugin registry wired to native Android APIs
- A sandboxed iframe runner (`AppViewerScreen`)
- The Vibe Coding AI screen
- Native home screen widget support
- Deep link handling (`appaba://open/{appId}`)

**Key files:**
- [apps/mobile/src/screens/AppViewerScreen.tsx](apps/mobile/src/screens/AppViewerScreen.tsx) — iframe runner + plugin bridge
- [apps/mobile/android/app/src/main/java/app/appaba/mobile/](apps/mobile/android/app/src/main/java/app/appaba/mobile/) — native Java plugins

---

### 2. Mini-Apps

A mini-app is a **single self-contained HTML file**. It can use vanilla JS, Preact via ESM CDN, or any framework that ships as a single bundle. No build step required.

**Minimum viable mini-app:**
```html
<!doctype html>
<html>
<head>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="appaba-sdk.js"></script>
</head>
<body class="bg-gray-900 text-white p-4">
  <h1 class="text-2xl font-bold">Hello AppAba</h1>
  <button onclick="getLocation()" class="mt-4 bg-indigo-600 px-4 py-2 rounded-xl">
    Get my location
  </button>
  <p id="out" class="mt-4 text-gray-400"></p>
  <script>
    async function getLocation() {
      await AppAba.Geolocation.requestPermissions()
      const pos = await AppAba.Geolocation.getCurrentPosition()
      document.getElementById('out').textContent =
        pos.coords.latitude + ', ' + pos.coords.longitude
    }
  </script>
</body>
</html>
```

Mini-apps are stored in Supabase Storage and downloaded to device on first open. Subsequent opens load from local filesystem — no internet required.

---

### 3. AppAba SDK (`appaba-sdk.js`)

The SDK is a single JS file injected into every mini-app. It wraps the postMessage bridge into clean async functions.

**Include it:**
```html
<script src="appaba-sdk.js"></script>
```

**Full API reference:**

#### Device Capabilities
```js
const caps = await AppAba.getCapabilities()
// caps.platform          → 'android' | 'ios' | 'web'
// caps.device.model      → 'Pixel 7'
// caps.device.osVersion  → '14'
// caps.network.connected → true
// caps.battery.level     → 0.87
// caps.plugins           → ['Geolocation', 'Camera', 'Widget', ...]
```

#### GPS / Location
```js
await AppAba.Geolocation.requestPermissions()
const pos = await AppAba.Geolocation.getCurrentPosition({ enableHighAccuracy: true })
// pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy
```

#### Camera
```js
await AppAba.Camera.requestPermissions()
const photo = await AppAba.Camera.getPhoto({
  quality: 85,
  resultType: 'base64',    // 'base64' | 'uri' | 'dataUrl'
  source: 'CAMERA',        // 'CAMERA' | 'PHOTOS' | 'PROMPT'
})
// photo.base64String → raw base64 (no prefix)
// Display: <img src={"data:image/jpeg;base64," + photo.base64String} />
```

#### Haptics
```js
await AppAba.Haptics.impact('MEDIUM')   // 'LIGHT' | 'MEDIUM' | 'HEAVY'
await AppAba.Haptics.vibrate(300)        // milliseconds
```

#### Share
```js
await AppAba.Share.share({
  title: 'Check this out',
  text: 'Built with AppAba',
  url: 'https://appaba.app'
})
```

#### Clipboard
```js
await AppAba.Clipboard.write({ string: 'copied text' })
const { value } = await AppAba.Clipboard.read()
```

#### Toast Notifications
```js
await AppAba.Toast.show({
  text: 'Saved!',
  duration: 'short',    // 'short' | 'long'
  position: 'bottom',   // 'top' | 'center' | 'bottom'
})
```

#### Device Info
```js
const info = await AppAba.Device.getInfo()
// info.model, info.manufacturer, info.osVersion, info.platform
const battery = await AppAba.Device.getBatteryInfo()
// battery.batteryLevel (0–1), battery.isCharging
```

#### Network
```js
const net = await AppAba.Network.getStatus()
// net.connected (bool), net.connectionType ('wifi' | 'cellular' | 'none')
```

#### Screen Orientation
```js
await AppAba.ScreenOrientation.lock('landscape')   // 'portrait' | 'landscape'
await AppAba.ScreenOrientation.unlock()
```

#### Persistent Storage
```js
// Use instead of localStorage — survives app updates
await AppAba.Preferences.set('score', '1500')
const score = await AppAba.Preferences.get('score')   // returns string | null
await AppAba.Preferences.remove('score')
```

#### Home Screen Shortcut
```js
// Pins this mini-app as an icon on the Android home screen
// Requires Android 8.0+
await AppAba.Shortcut.create({
  appId: 'my-app-id',
  appName: 'My App',
  iconBase64: 'data:image/png;base64,...'   // optional, falls back to AppAba icon
})
```

#### Home Screen Widget
```js
// Creates or updates a dynamic native Android widget on the home screen
await AppAba.Widget.update('my-widget-id', {
  background: '#1e293b',
  rows: [
    { type: 'text',   value: 'Score: 1500',    size: 18, bold: true,  color: '#ffffff' },
    { type: 'text',   value: 'Updated 14:32',  size: 12, bold: false, color: '#94a3b8' },
    { type: 'image',  base64: photoBase64,      height: 60 },
    { type: 'button', label: 'Open',            appId: 'my-app-id' },
  ]
})

// Check if any widget slots are active
const { count } = await AppAba.Widget.getCount()

// Remove widget data
await AppAba.Widget.remove('my-widget-id')
```

**Widget row types:**
| type | fields | maps to |
|---|---|---|
| `text` | `value`, `size`, `bold`, `color` | `widget_title` (1st), `widget_subtitle` (2nd) |
| `image` | `base64`, `height` | `widget_image` |
| `button` | `label`, `appId` | `widget_button` with deep link |

Widget state is persisted in `SharedPreferences` — the widget re-renders correctly after reboot even when the app is killed.

---

### 4. Vibe Coding

The AI code generation feature built into AppAba. Users type a prompt in natural language and get a working mini-app in seconds — generated, injected, and running on the device with zero compilation.

**How it works:**
1. User types prompt in `VibeCodingScreen`
2. Request sent to `/api/vibe` (Vercel Edge Function)
3. Edge function proxies to AI provider (Anthropic / OpenAI / Gemini) with a system prompt that constrains output to AppAba-compatible HTML
4. Response streams back as SSE
5. Chunks assembled into a complete HTML file
6. File injected as a Blob URL into the preview iframe
7. If the iframe throws an error, a self-healing loop re-prompts the AI with the error message (max 2 attempts)

**Supported AI providers:**
- Anthropic Claude (claude-sonnet-4-6) — default, recommended
- OpenAI GPT-4o
- Google Gemini 1.5 Pro

API keys are stored locally on the device (BYOK — Bring Your Own Key). In production, a proxy with usage credits will replace this.

**The system prompt teaches the AI:**
- Output raw HTML only (no markdown, no explanation)
- Use Tailwind CDN + `appaba-sdk.js`
- Use only `AppAba.*` methods for hardware — never native browser APIs
- Mobile design rules (touch targets ≥44px, dark theme, full-width buttons)
- All AppAba SDK methods with exact code examples

---

### 5. Backend (Vercel + Supabase)

**Vercel:**
- Hosts the web app (`apps/web`)
- Edge Function: `/api/vibe` — AI proxy with streaming

**Supabase:**
- Auth: OTP email (8-digit code)
- Database: `apps` table with `id`, `slug`, `name`, `owner_id`, `storage_path`, `version`
- Storage: mini-app HTML files in `apps/{id}/` bucket

---

## Device Capability Detection

On every iframe load, AppAba broadcasts the device's full capability profile to the mini-app:

```js
// Received automatically by appaba-sdk.js
{
  platform: 'android',
  device: { model: 'Pixel 7', osVersion: '14', manufacturer: 'Google', isVirtual: false },
  network: { connected: true, type: 'wifi' },
  battery: { level: 0.87, charging: false },
  plugins: ['Geolocation', 'Camera', 'Haptics', 'Share', 'Clipboard',
            'Toast', 'Device', 'Network', 'ScreenOrientation',
            'Preferences', 'Shortcut', 'Widget']
}
```

Mini-apps use this to adapt their UI:
```js
const caps = await AppAba.getCapabilities()
if (caps.plugins.includes('Camera')) {
  // show camera button
}
if (!caps.network.connected) {
  // show offline mode
}
```

---

## Native Android Plugins

Custom Java plugins registered automatically via `@CapacitorPlugin` annotation:

| Plugin | Class | Methods |
|---|---|---|
| `Shortcut` | `ShortcutPlugin.java` | `create({ appId, appName, iconBase64? })` |
| `Widget` | `WidgetPlugin.java` | `update({ widgetId, layout })`, `remove({ widgetId })`, `getCount()` |

Standard Capacitor plugins (from `@capacitor/*` npm packages):
`Geolocation`, `Camera`, `Haptics`, `Share`, `Clipboard`, `Toast`, `Device`, `Network`, `ScreenOrientation`, `Preferences`, `Filesystem`, `LocalNotifications`

---

## Home Screen Widget Architecture

The widget system follows a "fixed slots, dynamic data" pattern imposed by Android's `RemoteViews` constraint:

```
Mini-app JS
  → AppAba.Widget.update(id, layout)
  → appaba-sdk.js postMessage
  → WidgetPlugin.java
  → SharedPreferences.putString("widget_layout_" + id, json)
  → AppWidgetManager.updateAppWidget(ids, buildViews())
  → AppAbaWidgetProvider.buildViews()
  → RemoteViews setters (text, bitmap, visibility, pendingIntent)
  → Native Android home screen widget renders
```

On reboot or app kill, Android calls `AppAbaWidgetProvider.onUpdate()` which reads from `SharedPreferences` and re-renders — no app process required.

---

## Auth Flow

1. User enters email → `supabase.auth.signInWithOtp({ email })`
2. Supabase sends 8-digit code to email
3. User enters code → `supabase.auth.verifyOtp({ email, token, type: 'email' })`
4. Session established — same flow on web and mobile

---

## Deep Links

Scheme: `appaba://`

| URL | Action |
|---|---|
| `appaba://open/{appId}` | Open a specific mini-app by ID |
| `appaba://` | Open AppAba home screen |

Used by home screen shortcuts and widget buttons to re-enter a specific mini-app.

---

## Repository Structure

```
appaba/
├── apps/
│   ├── mobile/                     # Capacitor Android app (React)
│   │   ├── src/
│   │   │   ├── screens/
│   │   │   │   ├── AppListScreen.tsx       # Home — list of mini-apps
│   │   │   │   ├── AppViewerScreen.tsx     # iframe runner + plugin bridge
│   │   │   │   ├── VibeCodingScreen.tsx    # AI code generation
│   │   │   │   ├── SettingsScreen.tsx      # API keys + provider selection
│   │   │   │   └── AuthScreen.tsx          # OTP login
│   │   │   ├── hooks/
│   │   │   │   └── useApps.ts              # Download, cache, list mini-apps
│   │   │   └── lib/
│   │   │       └── filesystem.ts           # Local file storage helpers
│   │   └── android/app/src/main/java/app/appaba/mobile/
│   │       ├── MainActivity.java           # Capacitor entry point
│   │       ├── ShortcutPlugin.java         # Home screen shortcut native plugin
│   │       ├── WidgetPlugin.java           # Widget bridge native plugin
│   │       └── AppAbaWidgetProvider.java   # Android AppWidgetProvider
│   └── web/                        # Vercel web app (React)
│       ├── src/
│       │   └── pages/              # Web dashboard for uploading mini-apps
│       └── api/
│           └── vibe.js             # Edge Function — AI proxy (Anthropic/OpenAI/Gemini)
└── packages/
    └── shared/
        └── src/
            └── appaba-sdk.js       # SDK included in every mini-app
```

---

## Why AppAba is Different

| Feature | App Store Apps | Progressive Web Apps | AppAba |
|---|---|---|---|
| Install required | Yes | No | No |
| Native device APIs | Yes | Partial | Yes (full) |
| Build step required | Yes | Yes | No |
| Works offline | Yes | Sometimes | Yes |
| AI-generated in seconds | No | No | Yes |
| Home screen widget | Yes | No | Yes |
| Home screen icon | Yes | Partial | Yes |
| Zero compilation | No | No | Yes |

The unfair advantage: AppAba separates the runtime (pre-compiled APK, installed once) from the apps (HTML files, downloaded on demand). This makes it the only platform where an AI can generate a fully native-capable mobile app and have it running on a real device in under 10 seconds.
