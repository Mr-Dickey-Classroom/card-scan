# STCS Card Scan

An answer-card scanner for Mr. D's classes at STCS, replacing Plickers. It runs in the phone's
web browser, keeps every student name on the phone, and never sends anything over the internet.

The full plan is in `BUILD_BRIEF.md`. What's done so far is in `PROGRESS.md`. `reference/` holds the tested card codes, the prototype and
the original scanner tests. Don't change the card codes: 40 cards are already printed.

## Status

**Milestones 1–3 are done.** The app is online at
**https://mr-dickey-classroom.github.io/card-scan/**. It installs to the phone's home screen and
works offline. Next is Milestone 4 (classroom polish).

## Sharing with other teachers

Send them the link above. They open it in Chrome and install it to the home screen. Each phone keeps
its own classes and students, and nothing is shared between phones. On the first visit the app asks
for their class names. Teachers with more than 40 students choose **Each class uses cards 1–40**.
Everyone prints the same card PDF from the Cards tab. Every update you publish reaches all of them,
so try changes on your own phone first.

## Publishing updates

The code lives on GitHub at github.com/Mr-Dickey-Classroom/card-scan. Every time new work is pushed
(uploaded) to the `main` branch, GitHub rebuilds the app and publishes it in about a minute. You can
watch it on the repository's **Actions** tab: a green check means it's live. Phones pick up the new
version next time the app opens, with an **Update now** banner.

## Everyday commands

Open the Terminal app, go to this folder, and type one of these:

| Command | What it does |
| --- | --- |
| `npm install` | Downloads the tools the project needs. Do this once, and again if `package.json` changes. |
| `npm run dev` | Starts the app on your computer. Open the address it prints (http://localhost:5173). Press Control+C to stop it. |
| `npm run dev -- --host` | Same, but your phone can open it too, if it's on the same Wi-Fi. Photo scanning only. |
| `npm run dev:phone` | Same, with a secure (https) address, so the phone lets the app use the **live camera**. |
| `npm test` | Runs every automated check (logic tests, then scanner tests in a real browser). |
| `npm run build` | Makes the finished app in the `dist/` folder, the same thing GitHub publishes. |
| `npm run preview` | Opens the finished app from `dist/`, with offline support, at http://localhost:4173. |

### Trying it on your phone (live scanning)

Phones only allow the camera on secure (https) addresses. `npm run dev:phone` makes one on your
home network, using a certificate your computer makes for itself.

1. Put your phone and computer on the **same home Wi-Fi**. School Wi-Fi usually blocks this.
2. On the computer, run `npm run dev:phone`.
3. It prints two addresses. Type the **Network** one, starting with **https**, into Chrome on your
   phone. It looks like `https://192.168.1.23:5173`. Type the `s` in `https`.
4. Chrome shows a warning: **"Your connection is not private."** That's expected. The warning means
   the certificate was made by your own computer, not by a company Chrome knows. Nothing leaves your
   house. Tap **Advanced**, then **Proceed to 192.168.… (unsafe)**. You'll do this once per visit.
5. On the Roster tab, paste a few names. On Bell work, make a set, open it, and tap **Live scan**.
   Chrome asks to use the camera: tap **Allow**.
6. Point the phone at the cards. Each card gets a box with the student's first name and letter.
   A name is recorded after it's seen twice in a row, with a short buzz. The bar at the top counts
   "answered", and **Missing** lists who hasn't been read. Tap **Done** to save.

The ⚙ button in the live view can hide the right/wrong colors (so students can't see them), and can
show the detection speed for testing. **Take photo of room** still works if the camera won't start.

Easier: use the online address above, which is already https, so there's no warning.

## How the code is organized

| File | What's in it |
| --- | --- |
| `src/detect.js` | Card reading: the 40-card dictionary, the letter-on-top rule, the tilted-card rule, reading at 3 sizes. |
| `src/live.js` | The full-screen live camera view: boxes, progress bar, Missing list, wake lock. |
| `src/scan-worker.js` | Reads camera frames in the background (a Web Worker), so the preview stays smooth. |
| `src/debounce.js` | The "seen twice in a row" rule for live scanning. |
| `src/vendor/` | The js-aruco2 card-reading library (MIT license), bundled so nothing loads from the internet. |
| `src/roster.js` | One student list. Each student has one card number (1–40) in every class. |
| `src/scoring.js` | Scores, absent rules, report date ranges, questions to reteach. |
| `src/csv.js` | Spreadsheet (CSV) reading and downloads. |
| `src/upload.js` | Question and roster uploads from CSV files: the preview, problems by row, and saving. |
| `src/paste.js` | Turns pasted questions or letters into a bell work set. |
| `src/backup.js` | Backup files, including converting the prototype's old backups. |
| `src/storage.js` | Saves to the phone (IndexedDB). |
| `src/sw.js` | The service worker: keeps the app's files on the phone so it opens offline. |
| `public/` | The manifest and icons. `scripts/make-icons.mjs` redraws the icons. |
| `.github/workflows/deploy.yml` | Publishes the app to GitHub Pages on every push. |
| `src/main.js`, `src/styles.css`, `index.html` | The screens. |
| `tests/unit/` | Logic tests (Vitest). |
| `tests/scanner/` | Scanner tests in a real browser (Playwright): made-up classroom photos, `room.jpg`, a full run through the app on a phone-sized screen, and live scanning with a fake camera. |

## If `npm install` complains about "root-owned files"

Your computer's npm download cache has a permissions problem left over from an older Node.js.
Fix it once by running the command below in Terminal. It asks for your Mac password.

```bash
sudo chown -R 501:20 "/Users/michaeldickey/.npm"
```
