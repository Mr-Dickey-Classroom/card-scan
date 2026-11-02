# STCS Card Scan

An answer-card scanner for Mr. D's classes at STCS, replacing Plickers. It runs in the phone's
web browser, keeps every student name on the phone, and never sends anything over the internet.

The full plan is in `BUILD_BRIEF.md`. `reference/` holds the tested card codes, the prototype and
the original scanner tests. Don't change the card codes: 40 cards are already printed.

## Status

**Milestone 1 is done:** the project is set up, the prototype's logic is split into tested parts,
and photo scanning works. Next is Milestone 2, live camera scanning.

## Everyday commands

Open the Terminal app, go to this folder, and type one of these:

| Command | What it does |
| --- | --- |
| `npm install` | Downloads the tools the project needs. Do this once, and again if `package.json` changes. |
| `npm run dev` | Starts the app on your computer. Open the address it prints (http://localhost:5173). Press Control+C to stop it. |
| `npm run dev -- --host` | Same, but your phone can open it too, if it's on the same Wi-Fi. |
| `npm test` | Runs every automated check (logic tests, then scanner tests in a real browser). |
| `npm run build` | Makes the finished app in the `dist/` folder. (Milestone 3 publishes this online.) |

### Trying it on your phone (photo scanning)

1. Put your phone and computer on the **same home Wi-Fi**. School Wi-Fi usually blocks this.
2. On the computer, run `npm run dev -- --host`.
3. It prints two addresses. Type the **Network** one (it looks like `http://192.168.1.23:5173`) into Chrome on your phone.
4. On the Roster tab, paste a few names. On Bell work, make a set, open it, and tap **Take photo of room**.

The live camera view needs a secure (https) address, so it comes with Milestones 2–3. Photo
scanning works now.

## How the code is organized

| File | What's in it |
| --- | --- |
| `src/detect.js` | Card reading: the 40-card dictionary, the letter-on-top rule, the tilted-card rule, reading at 3 sizes. |
| `src/vendor/` | The js-aruco2 card-reading library (MIT license), bundled so nothing loads from the internet. |
| `src/roster.js` | One student list. Each student has one card number (1–40) in every class. |
| `src/scoring.js` | Scores, absent rules, report date ranges, questions to reteach. |
| `src/csv.js` | Spreadsheet (CSV) downloads. |
| `src/paste.js` | Turns pasted questions or letters into a bell work set. |
| `src/backup.js` | Backup files, including converting the prototype's old backups. |
| `src/storage.js` | Saves to the phone (IndexedDB). |
| `src/main.js`, `src/styles.css`, `index.html` | The screens. |
| `tests/unit/` | Logic tests (Vitest). |
| `tests/scanner/` | Scanner tests in a real browser (Playwright): made-up classroom photos, `room.jpg`, and a full run through the app on a phone-sized screen. |

## If `npm install` complains about "root-owned files"

Your computer's npm download cache has a permissions problem left over from an older Node.js.
Fix it once by running the command below in Terminal. It asks for your Mac password.

```bash
sudo chown -R 501:20 "/Users/michaeldickey/.npm"
```
