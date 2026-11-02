# STCS Card Scan — Build Brief

This brief is for Claude Code. It describes an installable web app (a PWA) that replaces Plickers in Mr. D's classroom. A working prototype already exists, and its card format and scanning logic have been tested. **Build on what is in `reference/`. Do not redesign the cards or the scanning logic.** 40 cards are already printed and in students' hands, so they have to keep working.

---

## For Michael: how to use this kit

1. Install Claude Code on your computer, or use it at claude.ai/code.
2. Make a free GitHub account if you don't have one. The app will be hosted for free on GitHub Pages, at a link like `yourname.github.io/card-scan`.
3. Put this whole folder in a new project folder and open Claude Code there.
4. Start each session with: **"Read CLAUDE.md and BUILD_BRIEF.md, then do Milestone N."** Do one milestone per session, then test it on your phone before moving on.
5. Plan on about 4–6 sessions over a few weeks. Milestones 1–3 get you a working app. Milestones 4–5 make it great.

---

## 1. Who it's for and what it must do

- **User:** one teacher, Mr. D, using an Android phone that can't install the Plickers app. He teaches four classes: 7th Math, 8th Math, Earth Science and JH Science, with roughly 10–30 students each.
- **Job:** students hold up printed cards turned so their answer letter (A–D) is on top. The teacher points the phone at the room, and the app records each student's answer, marks it right or wrong, and builds reports for the gradebook.
- **Setting:** a classroom with mixed lighting, with the teacher at the front and students up to about 30 ft away. School Wi-Fi may be flaky, so the app must work offline once loaded.

## 2. Hard requirements

1. **Keep the cards compatible.** Use `reference/card-codes.json` (40 codes, already printed). Mr. D has fewer than 25 students across all four classes, so 40 cards are plenty. Detection rules are in section 5.
2. **One card number per student, in every class.** A student who is in more than one class (for example 7th Math and JH Science) is one person with one card number. See "Students and classes" in section 3.
3. **Live camera scanning** is the headline feature. Names fill in as the teacher sweeps the phone across the room, like Plickers. Keep photo scanning as a fallback.
4. **Installable and offline.** Include a web app manifest and a service worker that caches the app shell and libraries. Use HTTPS, which GitHub Pages provides. Camera access requires HTTPS.
5. **Student data stays on the device by default.** Store everything in IndexedDB. There is no server and no analytics. At runtime, make no network requests other than loading the app itself: bundle or self-host every library and font.
6. **Import the prototype's data.** Accept the prototype's backup JSON (version 1, section 6) and convert it to the new format, so Mr. D can move his rosters and history over. `reference/sample-backup.json` is a test file with made-up names.
7. **It must be usable one-handed on a phone,** with big touch targets. It has to work at a 360px width.

## 3. Features (match the prototype, then improve)

Open `reference/prototype-artifact.html` in a browser to see how the current version works. It needs Claude's artifact runtime for saving, so outside claude.ai it runs in "Not saving" or device mode, which is fine for reference. Keep its information design: class chips at the top, then tabs for **Bell work / Roster / Reports / Cards**.

- **Classes:** start with the four classes above, which can be renamed. Allow adding and archiving a class.
- **Students and classes (one card number per student):**
  - Keep **one student list** for the whole app. Each student has a name and **one card number (1–40) that is the same in every class.** Card numbers are unique across the app: no two students share a number, even if they're in different classes.
  - A class is a list of the students enrolled in it. The same student can be in any number of classes.
  - **Adding to a class:** paste names one per line. If a pasted name matches a student who's already in the app (ignoring case and extra spaces), enroll that student and keep their number. Show "Ava Martinez — already card #12." A new name gets the lowest free number from 1–40.
  - Also offer "Add existing students," a searchable checklist of everyone not yet in this class. This is the fast way to build JH Science from the 7th and 8th grade rosters.
  - If two different students really do share a name, let the teacher choose "Same student" or "Different student" when the match comes up.
  - **Removing a student from a class** only takes them off that roster, and their past answers stay. Deleting a student entirely is a separate action on the Students screen, with an inline confirmation. Never use `confirm()`.
  - **Changing a card number** changes it everywhere. Block a number that's already taken, and show who has it.
  - Add a **Students screen** listing everyone, with their card number and classes. It can be sorted by name or by number, and printed as a "Who has which card" list.
  - When a card is scanned in a class, match it only against students enrolled in that class. A card from a student not in the class shows as "Card 23 (Ana R.) isn't in this class," with a button to add them.
- **Bell work sets:** each set has a title, a date, and questions. Each question has optional text, optional text for choices A–D, and a correct answer, which is A, B, C, D or "Survey" (participation only, not graded). Include the paste parser from the prototype: numbered questions with a `CORRECT: X` line, or just letters like `B A C A`.
- **Upload questions from a CSV file:** this is how Mr. D will add most questions. He makes them in Excel or Google Sheets and saves or downloads them as CSV.
  - **Columns** (header row required, column order doesn't matter, names not case-sensitive): `class, date, set_title, question_number, question, choice_a, choice_b, choice_c, choice_d, correct`. Examples are in `reference/csv/`: `questions_TEMPLATE.csv` and this week's real 7th and 8th grade questions.
  - **One file can hold many sets and classes.** Rows with the same class + date + set_title become one set, ordered by `question_number`.
  - **`class`** matches a class name, ignoring case. If a class name isn't recognized, ask which class to use instead of guessing. If the file has no `class` column, use the class that's open.
  - **`date`** accepts `2026-11-09`, `11/9/2026` and `11/9/26`.
  - **`correct`** accepts A–D in either case, or `Survey`, `S`, `Any` or blank (all meaning survey).
  - **Choices are optional,** so a file with only `question` and `correct` works.
  - **Handle real-world files:** Excel's byte-order mark, quoted fields with commas and line breaks, semicolon separators from non-US Excel, and trailing empty rows.
  - **Show a preview before saving:** "4 sets, 16 questions," with sets listed by class and date, plus a list of problems with row numbers ("Row 7: correct answer 'E' isn't A–D"). Let the teacher fix the file and re-upload, or import the rows that are fine.
  - **If a set with the same class, date and title already exists,** ask "Replace" or "Keep both." Never silently overwrite a set that already has scanned answers.
  - **Also export:** a "Download as CSV" button on any set or class writes the same format, so files round-trip.
- **Upload a roster from a CSV file:** columns `name` (required), and optionally `class` and `card`. Use the same matching rules as pasted names. A student already in another class keeps their number. A `card` value that belongs to someone else is flagged in the preview, not applied.
- **Scan screen:**
  - Pick the question.
  - **Live scan:** the camera fills the screen, with a box drawn on each card it reads and the student's first name and letter on it. A progress bar shows "14 / 18 answered." A "Missing" drawer lists who hasn't been read yet. Tap Done to save.
  - Tapping a student's answer lets the teacher fix it by hand.
  - **Photo scan** works the same as the prototype.
  - Read each card once. Re-reading the same card overwrites that student's answer, since students may change their minds before Done.
- **Reports:**
  - Ranges: this week, last week, all, or chosen sets.
  - Each student gets a score per set (`correct/graded`), an overall %, and points out of 10.
  - Questions nobody was scanned on are excluded.
  - A student with no answers in a set is "absent" and left out.
  - A missed question on a day the student was present counts as wrong.
  - Show a "Questions to reteach" list with each question's percent correct.
  - Offer two CSV exports: scores, and every answer.
- **Cards:** download the 40-card PDF (`reference/STCS_Answer_Cards_1-40.pdf`), or reprint a single card (for a lost one) or any range. Show printing and scanning tips.
- **Backup:** download a backup as JSON and restore from a file, with an inline summary and confirmation. Remind the teacher weekly with a gentle banner if no backup was made in the last 7 days.
- **Projector view (nice to have):** a large-text page showing the current question and a live count of answers, without revealing who answered what. The teacher can mirror the phone, or open it on the classroom computer.

## 4. Tech choices

- Use **plain HTML, CSS and JavaScript (ES modules) with Vite** for the build. A framework isn't needed. If one helps, use something small like Preact. Keep dependencies minimal and pinned.
- **Detection library:** `js-aruco2@2.0.0` (MIT). Copies are in `reference/vendor/` (`cv.js`, `aruco.js`, and the license). Bundle them; don't use a CDN.
- **Storage:** IndexedDB, through a tiny wrapper or `idb-keyval`. Ask the browser for persistent storage with `navigator.storage.persist()`.
- **Hosting:** GitHub Pages, deployed by a GitHub Actions workflow on push to `main`. Explain each step to Michael in plain words. He is not a developer.
- **Tests:** Playwright, which is already used in `reference/scanner-tests/`.

## 5. Card format and detection (tested — keep exactly)

- **Marker:** a 4×4-bit square with a 1-cell black border, 6×6 cells in all. The quiet zone is white. On the printed card the marker is 6 in. on a letter page, and its rows match the order of `card-codes.json`.
- **Codes:** 40 values in `card-codes.json`. Card *n* uses `codes[n-1]`. Bits are read MSB-first, row by row. A `1` bit is a **white** cell. The codes have a minimum Hamming distance of 4 across all rotations. Never reorder them.
- **Dictionary for js-aruco2:**
  ```js
  AR.DICTIONARIES.STCS_CARDS = { nBits: 16, tau: 2, codeList: CODES };
  const det = new AR.Detector({ dictionaryName: "STCS_CARDS", maxHammingDistance: 2 });
  ```
  - `tau: 2` accepts a perfect read or one wrong cell. With these 40 codes, testing showed 0 phantom cards (ids not in the picture).
  - Reject any card id ≥ 40.
  - Before ever adding cards beyond 40, switch to exact matching (`tau: 1`). A test with 100 codes and one-cell tolerance produced about 1 phantom card per 228 reads.
- **Which letter is on top:**
  - Take the detected corners `c[0..3]`. `c[0]→c[1]` is the card's A edge.
  - Compute the angle from straight up to the vector from the card's center to the middle of that edge: `ang = atan2(mx, -my)` in degrees, with y pointing down.
  - `k = round(ang/90)` gives the letter `['A','D','C','B'][((k % 4) + 4) % 4]`.
  - **If the angle is more than 32° from the nearest quarter turn, return "tilted" and don't guess.** In testing this rule took wrong answers to zero; tilted cards get re-read instead. Show which students were tilted.
- **Multi-scale:** on each image, run detection at 1×, ½× and ¼× (skip any scale smaller than 300 px). Keep the best read per card: lowest Hamming distance, then the side length closest to 80 px. Without the smaller scales, very large close-up cards are missed.
- **Photo orientation:** decode with `createImageBitmap(file, { imageOrientation: "from-image" })` so the phone's rotation setting is applied. Cap the longest side at 4200 px. Keep a "Photo was sideways? Turn answers" button that shifts the letter by a quarter turn.
- **Test results from the prototype** (synthetic 3000–4000 px photos, blur, JPEG, tilt up to 20–25°, shear): 0 wrong ids, 0 wrong letters, misses only below about 26 px per marker, about 0.4–0.9 s per photo on a desktop. Keep these as regression tests (see Milestone 1).

### Live scanning specifics (new)
- Request the rear camera with `getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } })`. If the phone supports it, try 3840×2160 and let the teacher pick "Far" (4K) or "Fast" (1080p). Apply `focusMode: "continuous"` when it's offered.
- Run detection in a **Web Worker**, posting `ImageData` from an `OffscreenCanvas`, so the camera preview stays smooth. Aim for at least 5 detections per second at 1080p on a mid-range Android phone. Measure this and show the rate in a debug overlay that can be turned on in settings.
- **Debounce:** record an answer only after the same card shows the same letter in 2 consecutive frames. If a card later shows a different letter steadily for 2 frames, update it.
- Give feedback on each new read: a short vibration (`navigator.vibrate(15)`) and the student's chip turning green or red, or neutral for Survey questions. Add a setting to hide right/wrong colors during the scan.
- Keep the screen awake during a scan (Wake Lock API, and handle a refusal gracefully).
- **Mirror check:** the rear camera isn't mirrored. If a front camera is ever used, flip the letter mapping (B↔D).

## 6. Data model (also the backup format)

**Version 2 (the new app's format): students live once, and classes point to them.**
```json
{
  "app": "stcs-card-scan", "version": 2, "exported": "2026-11-20T22:16:48.000Z",
  "students": { "k3j9x2ab": { "name": "First Last", "card": 7 } },
  "classes": { "math8": { "name": "8th Math", "color": "--c8", "order": 2, "archived": false,
               "studentIds": ["k3j9x2ab"] },
               "jhsci": { "name": "JH Science", "color": "--cjh", "order": 4, "studentIds": ["k3j9x2ab"] } },
  "sets": { "math8": { "w1102": { "title": "Bell work — L7", "date": "2026-11-02",
              "questions": [ { "text": "…", "choices": ["w = b + 3", "w = 3b", "b = 3w", "w = b ÷ 3"], "correct": "B" },
                             { "text": "", "correct": "ANY" } ],
              "answers": { "0": { "k3j9x2ab": "B" } }, "created": 1793570690280, "updated": 1793570690999 } } }
}
```
- `correct` is "A", "B", "C" or "D". "ANY" means a survey question. "" means not set yet.
- `choices` is optional: an array of up to 4 strings for A–D, filled from CSV uploads and shown on the scan screen and projector view.
- `answers` maps the question index (as a string) to student id → letter. Answers stay tied to the student id, so a student's history follows them if their card number changes.
- A student's card number is unique across `students`.

**Version 1 (the prototype's backup): each class has its own copy of its students.**
```json
{ "app": "stcs-card-scan", "version": 1,
  "classes": { "math8": { "name": "8th Math", "students": [ { "id": "k3j9x2ab", "name": "First Last", "card": 7 } ] } },
  "sets": { "…same as v2…": {} } }
```

**Migrating v1 → v2** (on restore of a v1 backup; keep this working forever):
1. Collect every student from every class. Treat two entries as the same student when their names match, ignoring case and extra spaces.
2. Each merged student keeps one id, the first one seen. Rewrite every `answers` entry that used the other ids to that id, so no history is lost.
3. If the merged entries had different card numbers, keep the number from the earliest class (by `order`) and list the change for the teacher: "Ben Okafor: kept #2 (was #5 in JH Science)."
4. If two *different* students end up with the same number, keep it for the first one and give the other the lowest free number, also listed.
5. Show the list after restore so Mr. D can hand out corrected cards. The automated test must cover each of these cases.

## 7. Milestones (one session each; each ends with something Michael can test on his phone)

**Milestone 1 — Project, port, and tests.**
- Set up Vite with the folder layout and README.
- Port the prototype's logic into modules: storage (IndexedDB), detection, scoring, CSV, backup.
- Port `reference/scanner-tests/` into automated Playwright tests: the synthetic scenes, plus the `room.jpg` photo, which must read cards 1–8 as A, B, C, D, A, B, C, D in that order.
- Add unit tests for the scoring rules in section 3, for the shared student list (one number per student across classes, no duplicate numbers), and for the v1 → v2 migration in section 6.
- Add question CSV upload with preview (section 3). The three files in `reference/csv/` must import cleanly: the 7th grade file gives 4 sets and 20 questions, and the 8th grade file gives 4 sets and 16 questions. Add tests for a file with a bad `correct` value, a file saved by Excel (byte-order mark, quoted commas), and a re-upload of an existing set.
- Done when the tests pass and `npm run dev` shows the app working with photo scanning.

**Milestone 2 — Live camera scanning.**
- Build the full-screen scan view, detection in a worker, the debounce, overlay boxes with names, the progress bar and missing list, vibration, and wake lock.
- Show a detections-per-second readout.
- Done when Michael can scan 4 cards on a desk from about 10 ft and see all four fill in.

**Milestone 3 — Installable and online.**
- Add the manifest, icons (school colors: green, yellow, black), service worker, and offline support.
- Set up the GitHub Pages deploy with Actions.
- Add backup and restore, including importing the prototype's backup file.
- Done when the app installs to the Android home screen, opens in airplane mode, and Michael's prototype backup imports correctly.

**Milestone 4 — Classroom polish.**
- Projector view, the weekly backup reminder, archiving classes, and a far/fast camera toggle.
- Accessibility: focus states, labels, and reduced motion.
- Make the empty states helpful.
- Done after a real classroom trial. Fix whatever it reveals.

**Milestone 5 — Optional: sync between devices.** Only do this if Michael asks and has confirmed with STCS administration that storing student names in a cloud service is allowed (FERPA and school policy). Use Supabase or Firebase with sign-in limited to his account and row-level security. Document what is stored where.

## 8. Things to avoid

- Don't change the card codes or the angle and letter mapping.
- Don't add analytics, ads, third-party fonts or scripts loaded at runtime, or any upload of photos. Photos are processed on the device and never saved unless the teacher chooses to.
- Don't use `alert()` or `confirm()`. Put confirmations in the page itself.
- Don't guess an answer for a tilted card.

## 9. Classroom test checklist (Michael)

- [ ] Print 4 test cards on plain paper and tape them to the wall at 10, 20 and 30 ft. Do they read at each distance? Try with the lights on and off.
- [ ] Hold each card in all four positions. Do the letters come out right?
- [ ] Tilt a card about 40°. It should show as "tilted," not as a wrong letter.
- [ ] Do a full class scan of one question. How long did it take, and who was missed?
- [ ] Put the phone in airplane mode. The app should still open and scan.
- [ ] Export a CSV and open it in your gradebook spreadsheet.
