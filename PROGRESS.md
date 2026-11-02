# Progress

Where the build stands, milestone by milestone (BUILD_BRIEF section 7). Newest at the top.

## Milestone 4: classroom polish (built 2026-11-02, waiting on a classroom trial)

- **Projector view.** On a set, tap **Projector view**: the question, its choices and
  "4 / 5 answered" in big text on a dark screen, for mirroring the phone to the classroom screen.
  No names, ever. **Show answer** highlights the right choice and shows how many picked each letter
  and the percent who got it. ← → change the question. **Live scan** from here opens in projector mode.
  On a computer, the arrow keys change the question and Esc closes it.
- **Projector mode in the live scan** (⚙ → *Projector mode*): the question in big text and the count.
  No name chips, and the boxes on the cards have no names or letters. Remembered for next time.
- **Far / Fast camera** (⚙ in the live scan). Fast asks for 1080p; Far asks for 4K, to read small
  cards at the back of the room (fewer frames a second). Phones without 4K show Far greyed out with
  a note. Switching keeps the cards already read. Remembered for next time.
- **Weekly backup reminder.** A gentle banner on Bell work and Roster when there's no backup from
  the last 7 days: **Download backup** or **Not now** (asks again tomorrow). A new phone gets a week
  before the first reminder. The Cards tab shows the date of the last backup.
- **Accessibility.** Every button and box has a name a screen reader can read (the answer picker
  says "Ava Martinez: C"). A clear focus ring, including on yellow buttons. The live scan and the
  projector view hold keyboard focus and hand it back when closed. "Reduce motion" on the phone turns
  off all animation.
- **Helpful empty screens.** No bell work yet: the two ways to start. No students: a **Go to Roster**
  button. Reports says why it's empty (no students, no sets, nothing in this week, nothing scanned
  yet) with the button that fixes it. The live scan suggests more light after 10 s with no cards.
- Hiding classes was done earlier (see below).
- Tests: `tests/unit/backup-reminder.test.js` and `tests/scanner/polish.spec.js` (projector view, live
  projector mode, Far/Fast with a fake 4K camera, the reminder, control names, reduced motion, empty
  screens). The fake camera moved to `tests/scanner/fake-camera.js`. 101 logic tests and 27 browser tests pass.

**Still to do for Milestone 4:** the classroom trial (BUILD_BRIEF section 9), then fix what it shows.
Not built yet from section 3 of the brief: the **Students** screen (everyone, with their card number
and classes, sortable, printable as "Who has which card", and deleting a student).

## Ready for other teachers (2026-11-01)

Other teachers open the same link and install it. Each phone keeps its own classes and students.
- **First visit:** a **Welcome to Card Scan** panel asks for the teacher's class names (one per line)
  and how card numbers work. **Use the example classes** keeps the four starting classes. Phones that
  already have data (like Mr. D's) never see it.
- **Card numbers per class** (Cards tab → **Card numbers**), for teachers with more than 40
  students. Each class reuses cards 1–40: card 7 in one class and card 7 in another are different
  students, and the same name in two classes is two students. Scans match only the open class.
  The default is still one card per student across the app. Switching back is refused while two
  students share a number, and the app lists who. The cards, the codes and the scanning are unchanged.
  Saved as `settings.cards` (`"app"` or `"class"`) in the data and in backups.
- **Hide this class…** on the Roster tab (inline confirmation). Its students and bell work are
  kept. **+ Add class** lists hidden classes with **Bring back**. (This was a Milestone 4 item.)
- The install description no longer says "Mr. D's classes."
- Tests: `tests/unit/card-mode.test.js` (per-class numbering, scanning, roster files, switching
  back, backups) and `tests/scanner/new-teacher.spec.js` (first visit, hide and bring back).
  96 logic tests and 21 browser tests pass.

## Milestone 3 add-on: add as many classes as you like (2026-11-01)

- **+ Add class** at the end of the class row. Type a name; the new class gets its own color, opens
  on its Roster tab, and goes at the end of the row. A name you already use is refused.
- Uploading a questions or roster file with a class the app doesn't know now also offers
  **Make a new class called "…"**, alongside picking a class or skipping those rows.
- No limit on classes. The only limit is 40 cards: 40 students across all classes, since each
  student keeps one card number everywhere.
- Tests: `tests/unit/classes.test.js` and `tests/scanner/classes.spec.js`.

## Milestone 3: installable and online (done, 2026-11-01)

**The app's address:** https://mr-dickey-classroom.github.io/card-scan/
(code: github.com/Mr-Dickey-Classroom/card-scan, a public repository holding only code and made-up sample names).

**What was built**
- **Published with GitHub Pages.** `.github/workflows/deploy.yml` runs on every push to `main`:
  `npm ci`, the logic tests, `npm run build`, then publishes `dist/`. It takes about a minute.
  Live scan works on Mr. D's Android phone from this address (checked 2026-11-01).
- **Installable.** `public/manifest.webmanifest` and icons in school colors (yellow card 1 with
  "A" on top, black marker, green background). `scripts/make-icons.mjs` redraws them. The Cards tab
  has a **Home screen** panel with an **Add to home screen** button (or Chrome's ⋮ menu steps).
- **Works offline.** `src/sw.js` is the service worker. `npm run build` fills in the list of every
  built file and saves it as `dist/sw.js`. The phone keeps a copy of all of them after one visit.
  When a new version is online, a **"A new version of Card Scan is ready → Update now"** banner
  shows up. The app never swaps versions in the middle of a scan. There's no service worker under
  `npm run dev`.
- **Importing the prototype's backup.** Cards tab → **Restore from backup…** takes version 1
  (prototype) or version 2 files. The card numbers that change are listed before you restore, and
  again afterwards until you tap **Done, cards handed out**.

**Tests:** 84 logic tests and 17 browser tests pass (`npm test`). New: `tests/scanner/offline.spec.js`
builds the app, opens it once, goes offline and reopens it with the roster still there.
`tests/scanner/restore.spec.js` restores `reference/sample-backup.json` and a v1 file where one
student has two card numbers.

**Checked on Mr. D's Android phone (2026-11-01):** it installs to the home screen, opens and
scans in airplane mode, and his real prototype backup restores. Milestone 3 is done.

## Milestone 1 add-on: CSV uploads (done, 2026-11-01)

**What was built**
- **Upload questions (CSV)** on the Bell work tab. One file can hold many sets and classes. The app
  shows a preview first ("4 sets, 20 questions"), with each set listed by class and date.
  - Problems are listed by row ("Row 7: correct answer 'E' isn't A–D or Survey"). Fix the file and
    tap **Upload a fixed file**, or import the rows that are fine.
  - A class name the app doesn't know ("Math 8") gets a question: which class is it, or skip it.
  - If a set with the same class, date and title is already there, you choose **Replace** or
    **Keep both**. Import waits until you choose. Replace updates the questions and keeps answers
    you've already scanned.
  - Handles files from Excel and Google Sheets: the byte-order mark, quoted commas and line breaks,
    semicolons from non-US Excel, and blank rows at the end. Dates can be `2026-11-09`, `11/9/2026`
    or `11/9/26`. Correct can be A–D, or Survey / S / Any / blank.
- **Answer choices A–D** are saved with each question and shown on the question screen, with the
  right one in green. You can also type them in when making or editing a set.
- **Download as CSV** for a whole class (Bell work tab) or one set (Edit). It writes the same
  format, so a downloaded file uploads again unchanged. There's also a **Blank template** link.
- **Upload a roster (CSV)** on the Roster tab: a `name` column, plus `class` and `card` if you like.
  It uses the same rules as pasted names. A student already in another class keeps their number.
  A card number that belongs to someone else is flagged in the preview and not used.

**Checked with the real files in `reference/csv/`**
| File | Result |
| --- | --- |
| `questions_7th_math_week_of_11-2.csv` | 4 sets, 20 questions, no problems |
| `questions_8th_math_week_of_11-2.csv` | 4 sets, 16 questions, no problems |
| `questions_TEMPLATE.csv` | 1 set, 2 questions, no problems |

**Tests:** 84 logic tests and 14 browser tests pass (`npm test`). New: `tests/unit/upload.test.js`
covers the three files, a bad `correct` value, an Excel-saved file, re-uploading an existing set,
the download round trip, and roster files. `tests/scanner/upload.spec.js` does the same through
the real screens at phone width.

**Try it:** run `npm run dev`. On Bell work, tap **Upload questions (CSV)** and pick one of the files
in `reference/csv/`.

## Milestone 2: live camera scanning (done, 2026-11-01)

Full-screen **Live scan** with boxes and names on each card, the "14 / 18 answered" bar, a
**Missing** list, a buzz on each read, and the screen kept awake. An answer is recorded after the
same letter is seen twice in a row. Photo scanning is still there as a backup.
`npm run dev:phone` serves the app over https so the phone allows the camera (see README).
Still to check: scanning 4 cards on a desk from about 10 ft on your Android phone.

## Milestone 1: project, port and tests (done)

Vite project, the prototype's logic split into tested modules, scanner tests (synthetic photos and
`room.jpg` reading A B C D A B C D), and photo scanning in the app.

## Next

Finish Milestone 4 with the classroom trial. Milestone 5 (sync between phones) is optional, and only
after STCS confirms that storing student names in a cloud service is allowed.
