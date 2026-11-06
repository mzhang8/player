# Practice Player (online)

The browser-only version of [practice-player](https://github.com/mzhang8/practice-player): a video
player for learning songs (e.g. guitar) from videos on your computer. Same features, but no Flask
server — it's a static page hosted on GitHub Pages at **https://mzhang8.github.io/player/**.

GitHub only delivers the page. Videos play straight from your disk and are never uploaded.

**Requires Chrome (or Edge)**, which can open local folders from a web page.

## Using it

1. Open https://mzhang8.github.io/player/ and click **Choose videos folder…**, then pick
   `~/Downloads/practice-videos` (or wherever your videos are). Chrome asks to let the page view
   and edit the folder — edit access is only used to save `configs.json` there.

   Chrome won't let a web page open `~/Downloads`, `~/Desktop` or `~/Documents` themselves ("can't
   open this folder because it contains system files"), but subfolders inside them are fine — so keep
   practice videos in their own folder.
2. Pick a video from the dropdown.

Chrome remembers the folder. On later visits the videos list loads automatically, or (if Chrome
asks again) the button says **Reconnect "practice-videos"** — one click restores access.

Only top-level files with extension `.mp4`, `.mov`, `.mkv`, `.webm`, `.m4v`, or `.avi` are listed.

## Where settings and notes are saved

"Save settings for this video" and "Save time range" write to **`configs.json` inside the videos
folder** — a normal file next to your videos, in the same format as the Flask version's
`configs.json`. If the folder already has a `configs.json` (e.g. one copied over from the Flask
version), the page reads it when you open the folder.

- Clearing browser data doesn't touch it, and it moves along with the folder.
- If `configs.json` can't be read (e.g. a typo from hand-editing), the page won't overwrite it —
  saving stays off until it's fixed or removed.
- **Export settings & notes** downloads a copy of it. **Import…** merges another `configs.json` into
  it (settings from the imported file win; saved sections are combined without duplicates).
- Settings saved by the earlier version of this page (which kept them in browser storage) are moved
  into the folder's `configs.json` automatically the first time a folder is opened.

## Running it locally

The page needs to be served over `http://localhost` (not opened as a `file://`) for the folder
picker to work:

```bash
cd ~/Desktop/practice-player-online && python3 -m http.server 8000
```

Then open **http://localhost:8000**. Notes are read from and saved to the same `configs.json` in the
videos folder, whether you use the local or the live page.

## Publishing changes

GitHub Pages serves the `main` branch of this repo, so pushing publishes the update (it takes a
minute or so to go live):

```bash
git add -A && git commit -m "describe change" && git push
```
