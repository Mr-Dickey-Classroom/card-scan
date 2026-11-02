# Progress

Where the build stands, milestone by milestone (BUILD_BRIEF section 7). Newest at the top.

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

## Next: Milestone 3

Install the app to the phone's home screen, make it work offline, publish it with GitHub Pages,
and import the prototype's backup.
