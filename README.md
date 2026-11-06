# Practice Player (online)

The browser-only version of [practice-player](https://github.com/mzhang8/practice-player): a video
player for learning songs (e.g. guitar) from videos on your computer. Same features, but no Flask
server — it's a static page hosted on GitHub Pages at **https://mzhang8.github.io/player/**.

GitHub only delivers the page. Videos play straight from your disk and are never uploaded.

**Requires Chrome (or Edge)**, which can open local folders from a web page.

## Using it

1. Open https://mzhang8.github.io/player/ and click **Choose videos folder…**, then pick
   `~/Downloads` (or wherever your videos are). Chrome asks to allow the page to view the folder.
2. Pick a video from the dropdown.

Chrome remembers the folder. On later visits the videos list loads automatically, or (if Chrome
asks again) the button says **Reconnect "Downloads"** — one click restores access.

Only top-level files with extension `.mp4`, `.mov`, `.mkv`, `.webm`, `.m4v`, or `.avi` are listed.

## Where settings and notes are saved

"Save settings for this video" and "Save time range" store everything in this browser's local
storage for the site, not in a file. That means:

- They're tied to this Chrome profile. Clearing site data for mzhang8.github.io deletes them.
- **Export settings & notes** downloads them as `configs.json` — do this now and then as a backup.
- **Import…** merges a `configs.json` back in (settings from the file win; saved sections are
  combined without duplicates). This also works with the Flask version's `configs.json`, so you can
  move notes between the two.

## Running it locally

The page needs to be served over `http://localhost` (not opened as a `file://`) for the folder
picker to work:

```bash
cd ~/Desktop/practice-player-online && python3 -m http.server 8000
```

Then open **http://localhost:8000**. Local storage is per-address, so notes saved here are separate
from the ones on mzhang8.github.io (use Export / Import to move them).

## Publishing changes

GitHub Pages serves the `main` branch of this repo, so pushing publishes the update (it takes a
minute or so to go live):

```bash
git add -A && git commit -m "describe change" && git push
```
