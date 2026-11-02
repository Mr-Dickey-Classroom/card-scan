# STCS Card Scan (project notes for Claude Code)

- What this is: an installable, offline web app (PWA) that replaces Plickers for one teacher (Mr. D, STCS). The full spec is in `BUILD_BRIEF.md`. Read it at the start of every session.
- The owner is a teacher, not a developer. Explain setup steps (GitHub, deploys, phone install) in plain words, one step at a time, and say what he should see when it works.
- `reference/` is the tested source of truth for the card format and scanning logic (`card-codes.json`, `prototype-artifact.html`, `scanner-tests/`). Don't change the card codes or the letter-orientation rule. 40 cards are already printed.
- Student names stay on the device: IndexedDB, no analytics, no runtime third-party requests. Bundle all libraries.
- Work one milestone per session (BUILD_BRIEF section 7). End each session with: what was built, how to test it on the phone, and what the next milestone is.
- Run the Playwright scanner tests before saying detection works.
