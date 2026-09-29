# Lonely Road

A one-button PWA that plays the "I walk a lonely road…" line from Green Day's
*Boulevard of Broken Dreams*. Install it to your Android home screen, tap the
icon, and it plays.

No build step, no dependencies: it's static files in `public/`.

## 1. Get the song

The app doesn't ship any audio. Buy a DRM-free copy you can download as a file:

- **Amazon Music (Digital Music store)**: buy the MP3 (not the Unlimited
  streaming subscription), then download it from your Amazon Music library.
- **iTunes Store**: buy the track (not Apple Music streaming). It downloads as a
  DRM-free `.m4a`.
- **Bandcamp / 7digital / Qobuz**: also sell DRM-free downloads where available.

Streaming-only services (Spotify, YouTube Music, Apple Music) won't work: their
downloads are locked to their own apps.

Get the file onto your phone (Downloads folder, Google Drive, etc.).

## 2. Deploy to Vercel

Push this repo to GitHub, then in Vercel choose **Add New → Project**, import
the repo, and deploy with the defaults. `vercel.json` already points Vercel at
`public/`. Or from a terminal:

```sh
npx vercel --prod
```

## 3. Install on Android

1. Open your Vercel URL in **Chrome** on the phone.
2. Menu (⋮) → **Add to Home screen** → **Install**.
3. Open the app from the home screen.

## 4. Set up the clip (in the app)

1. Open **Set up the clip** → **Choose song file…** and pick the song.
2. Scrub the player to the line (it's the first vocal, a little way into the
   track), tap **Mark start here** just before it and **Mark end here** after
   "…the only one that I have ever known" (or wherever you want it to stop).
   You can also type the seconds.
3. **Preview clip**, adjust, then **Save clip**.

The app cuts that section out (with a short fade), saves just the clip on your
phone, and discards the full song. Nothing is uploaded anywhere.

**Alternative:** trim the clip yourself and deploy it with the site as
`public/audio/lonely-road.mp3` (or `.m4a`), e.g.
`ffmpeg -i song.mp3 -ss 24.5 -to 32 -af afade=t=out:st=31.7:d=0.3 public/audio/lonely-road.mp3`.
Keep the repo private if you do this, since that file is copyrighted audio. A
clip saved in the app takes priority over a bundled one.

## Using it

- **Tap the home-screen icon** → it opens and plays. If it's already open in
  the background, bringing it back to the front plays it again.
- **Long-press the icon** → **Walk the lonely road** shortcut, which you can
  also drag onto the home screen as its own icon.
- **Tap the big button** to replay.

### About widgets

Chrome on Android doesn't let PWAs create real home-screen widgets, so the
installed icon *is* the button: one tap opens the app and plays the line. If
the first play is ever blocked by the browser's autoplay rules, you'll see
"Tap the button to start walking", and one tap fixes it.

## Files

| Path | What it is |
| --- | --- |
| `public/index.html`, `style.css`, `app.js` | The app |
| `public/sw.js` | Service worker (works offline after the first load) |
| `public/manifest.webmanifest` | Install metadata, icon, long-press shortcut |
| `public/icons/` | App icon (`icon.svg` is the source) |
| `scripts/render-icons.mjs` | Regenerates the PNG icons from `icon.svg` (needs Playwright) |
| `vercel.json` | Serves `public/`, keeps `sw.js` from being cached |
