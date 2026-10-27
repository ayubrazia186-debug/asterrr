# Aster, revision tracker

A revision app for CAIE IGCSE: each subject has its own space with your 45-day plan, your own folders of topicals, papers and notes, and flashcards. The plan syncs both ways with your Google Sheets.

## Run it on your computer

1. Install Node.js (version 20 or newer) from <https://nodejs.org>.
2. In this folder run:
   ```
   npm install
   npm run dev
   ```
3. Open <http://127.0.0.1:5173>.

It starts with a snapshot of your sheets so you can look around straight away. Connect Google by following `sync/SETUP.md`.

## Put it online for your phone

```
npm run build:public
```

Upload the `dist-public` folder to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages). This build leaves out the snapshot, so your recording links and passcodes are not in the files. It loads everything from your sheets after you connect in Settings. Do not host the normal `dist` build publicly.

## Try sync without Google

```
npm run mock
```

Then in Settings use URL `http://127.0.0.1:8787/exec` and access code `test`.

## How it is laid out

- **Home**: every subject as a book cover. Click one to go inside.
- **Inside a subject** (left menu): Planner, Topicals, Yearly papers, Notes, Flashcards.
  - **Planner**: your 45-day plan from the sheet, by day or by topic. Ticks sync to the sheet.
  - **Topicals, Yearly papers, Notes**: your own folders (see below). Yearly papers also has "My scores" and Notes has "Written notes".
  - **Flashcards**: add cards one by one or paste many, then study the ones that are due.
- **Connected**: each planner class has a book button that opens the notes topic with the same name, and an **Ask AI** button that starts a lesson on it. Home shows **Continue studying** and flashcards that are due.
- **Dark mode:** Settings, Appearance: match your device, light or dark. Subject colours are re-tuned for dark, and the PDF reader follows it.
- **Today**: all subjects' classes for today and what you are behind on. **All-subject planner**: every subject across the 45 days.

## Folder layout (set this up once)

Keep **one library folder** with **one folder per subject**. The `[code]` in each subject folder's name is how Aster knows which subject it is, so your current names already work.

```
D:\ZAINEMETICS CRASHCOURSE\
  SIR SAAD HASSAN BUSINESS STUDIES [0450]\
    1.1 Business activity\          one folder per topic: number, then name
      lesson 1.mkv                   videos: any names
      notes.pdf                      notes: any names
      questions.pdf                  "question" or "worksheet" in the name = Questions
    1.2 Classification of business\
    Topicals\                       optional: questions by topic (same topic folders)
    Past papers\                    optional: any folders inside; names like 0450_s23_qp_11.pdf
    Books\                          optional: textbooks
  SIR WASSIM ABBAS ALVI ACCOUNTING [0452]\     (same idea, topics can be 1) Basics of accounting)
  SIR ZAIN UL AFAQ MATHS EXTENDED [0580]\
  SIR MUHAMMAD KHAWAJA GUL COMPUTER SCIENCE [0478]\
```

- **Notes** shows the subject folder without `Topicals` and `Past papers`. **Topicals** and **Yearly papers** show those two folders.
- Past papers are read from Cambridge file names: `0450_s23_qp_11.pdf` is the 2023 May/June paper 11 question paper, `_ms_` is the mark scheme. Aster groups them by year and session and has a **Both** button that opens the paper and its mark scheme side by side. A `w` is Oct/Nov, an `m` is Feb/March.
- Files with other names still work. They are shown as folders.

## Linking your library

**On your computer (Chrome or Edge):** open any subject's Notes, press **Choose library folder** and pick `ZAINEMETICS CRASHCOURSE` once. All four subjects link in that one step. Files are only read, never changed or uploaded. You can check the result in **Settings, Course library**.

- When you reopen Aster, the browser asks you to allow access again once (an **Allow access** button appears).
- Press **Refresh** after you add files.
- Folder links belong to this browser. They are not in **Download backup**.

## Using Aster on a tablet or phone

A tablet browser cannot open folders on your computer, so the computer serves them instead. Your computer must be on, on the same Wi-Fi, with the server running.

1. Install Node.js and (for `.mkv` on iPad or iPhone) ffmpeg on the computer.
2. `npm install`, then `npm run build` once.
3. Edit `Start Aster.bat` so `LIBRARY` is your folder, and double-click it. (Or run `npm run serve -- "D:\ZAINEMETICS CRASHCOURSE"`.)
4. The window shows an address like `http://192.168.1.20:5174` and a PIN. Open that address on the tablet, type the PIN.

What to expect:

- Videos **stream** with seeking, so a long recording starts straight away.
- `.mkv` plays in Chrome on Android. **iPad and iPhone cannot play most `.mkv`**, so Aster asks the computer to convert the video to `.mp4` once (needs ffmpeg) and keeps the result in `.aster-cache`. The first conversion of a long lesson can take a while.
- The server only reads your folder. It needs the PIN, and it is meant for your home Wi-Fi: do not expose the port to the internet.
- Flashcards, done-marks, written notes, paper scores and topic moves are **kept the same on every device** that opens Aster from your computer (changes arrive within about 20 seconds; if you change the same card on two devices the one with more reviews wins). Settings, Your devices shows the status. Video bookmarks and viewer choices stay on each device. The 45-day plan is shared through Google Sheets.

### Notes: link one course folder, any layout

Notes groups everything in the folder into **topics**. It copes with these:

| Your folder looks like | What Aster does |
| --- | --- |
| `1) BASICS OF ACCOUNTING/` ... `14) ...` (a folder per topic) | Each numbered folder is a topic, in number order. Subfolders such as `Videos`, `Notes`, `Topical questions` become the groups inside it. |
| One flat folder with `Section 1 topic 4 Types of ... Copy (3).pdf` and `3) 1.1 Business activity.mkv` | `Section 1 topic 4` and `1.1` become topics 1.4 and 1.1. The `Copy (3)` and `3)` clutter is removed from the title. |
| `Videos/`, `Notes/`, `Past papers/` (folders by type) | These are not treated as topics. The files inside are matched to topics by their names. |
| `2026-07-14 16-11-26.mkv` (OBS names) | Nothing in the name says the topic, so it waits in **Unsorted**. Choose **Move to...** once and Aster remembers it. |
| A textbook PDF at the top | Kept aside under **Books and loose papers**. |

An unnumbered file whose name contains all the words of a topic title (for example `Understanding business activity.mkv` for "Business activity") is placed in that topic and marked "matched by name". Move it if the guess is wrong.

To get the cleanest result, start a file or folder name with the topic number: `1.4 Types of business organisations.pdf`.

### Study view

Click a file and it opens full screen.

- **Videos** (`.mkv`, `.mp4`, `.mov`, `.webm`) play with 0.75x to 2x speed. Space plays or pauses, J goes back 10 s, L forward 10 s. Aster remembers where you stopped, and marks a video done when it ends.
- **PDFs** open in Aster's own reader: zoom, page jump, **Auto / Light / Sepia / Night** reading (Auto follows the app, so pages go dark in dark mode) and a brightness slider (N toggles night), and text you can select. Select text to **Make flashcard** or **Ask AI** about it. The **Browser viewer** button switches to the browser's own PDF viewer (it only gets a night filter).
- **Video tools** under the player: back/forward 10 s, **volume boost** up to 150%, 200% or 300% (measured: the level rises by exactly that factor, and loud parts are rounded off by a soft clipper instead of cracking; Normal does not touch the sound), **Voice boost** (lifts and evens out a speaking voice), fit or fill, picture brightness, picture-in-picture, **theater mode**, and **bookmarks** (B). A badge shows the recording's real size, for example `HD 720p`. Your choices are remembered on this device.
- Not possible: switching between SD and HD. A local recording is a single file with one quality, so Aster can only show which one it is. The AI tutor cannot watch videos, only read PDFs and text files.
- Open a video and a PDF together to see them **side by side**. Use the Video / Both / Notes buttons to focus one.
- If a video will not play, the recording uses a format Chrome does not have (HEVC is the usual one). Convert it once: `ffmpeg -i "in.mkv" -c:v libx264 -c:a aac "in.mp4"`, or if it is already H.264: `ffmpeg -i "in.mkv" -c copy "in.mp4"`.

## AI tutor (Google AI Studio and OpenRouter)

- **Keys:** Settings, AI tutor. Add keys from [Google AI Studio](https://aistudio.google.com/apikey) (free tier available) and/or [OpenRouter](https://openrouter.ai/keys). Add as many as you like, for example one per Google account. Aster uses the top key first and moves to the next one by itself when a key is out of quota or refused (or take turns, if you prefer). Drag order with the arrows.
- **Google's free quota is per project, not per key.** Two keys from the same Google account share one quota; keys from different accounts each have their own.
- Keys are saved only in this browser, sent only to their own provider, and are not in backups, the sheet sync or the code. On a tablet you can opt in to sharing keys through your computer (Settings, Your devices); that stores them as plain text on your computer.
- **Models:** the Google model defaults to `gemini-flash-latest`. If a model name stops working, Aster looks up a current Flash model for your key and remembers it. **Load Google models** lists everything your key can use. Temperature defaults to 0 (the same answer each time as far as a model allows); some newer Gemini models are tuned for their default of 1, so try that if answers loop or look odd.
- **It sees your whole study picture.** With the box ticked under the chat, each question carries a briefing: today's date and day of the plan, this subject's classes (today, behind, next 7 days) with which of the four steps are ticked, your own class notes, flashcard counts and the ones you keep forgetting, your logged paper scores, your written notes, and the names of your topics and how many files you finished. A second box adds a summary of your other subjects. **See exactly what is shared** shows the text. Recording links, passcodes and file contents are never in it.
- The open PDF (pages 1 to 12 by default) is added only while its box is ticked. Buttons: **What today?**, **Plan my week**, **How am I doing?**, Summarise, Quiz me, Make flashcards.
- The AI cannot watch videos, and cannot change your planner. It can only read and advise.

## Update the snapshot from new spreadsheets

```
python3 tools/extract.py <folder with the .xlsx files> src/data/plan.seed.json
```

## Files

- `sync/Code.gs` and `sync/SETUP.md`: the Google Apps Script and how to install it.
- `src/state/store.tsx` and `src/sync/client.ts`: where ticks are saved and sent.
- `src/data/subjects.ts`: subject names, codes and colours.
- `tools/serve.mjs`: the library server for tablets (PIN, streaming, ffmpeg conversion). `Start Aster.bat` starts it on Windows.
- `src/lib/folders.ts`, `sections.ts`, `organize.ts`, `papers.ts`: reading your folders and sorting them into topics and papers.
- `src/components/Study.tsx`, `PdfView.tsx`, `VideoTools.tsx`: the study view, PDF reader and video tools.

## Make it an app

### Desktop (Windows, Mac, Linux)
The `desktop/` folder is the Aster desktop app (Electron). It opens Aster in its own window, asks you once for your library folder, has no PIN on the computer itself, and plays your videos and PDFs the same as the browser.

1. Install Node 20 from nodejs.org.
2. Open a terminal in `desktop`, then run `npm install`.
3. Try it: `npm start`.
4. Make the installer: `npm run dist:win` (on Windows), `npm run dist:mac` (on a Mac) or `npm run dist:linux`. Build on the system you are building for. The results land in `desktop/release`: on Windows a Setup .exe and a portable .exe.

Windows may show a "SmartScreen" warning because the app is not code-signed. Choose More info, then Run anyway.
For tablets and phones, use the app's menu: Aster, Tablet and phone access. It shows the address and PIN. The desktop app includes ffmpeg, so .mkv videos are converted for phones and iPads automatically.
Your planner and progress live inside the app's data folder; the library folder is never modified.

### Phone (Android APK)
The `android/` folder is a small launcher app that opens Aster from your computer over Wi-Fi. See `android/README.md`. The easiest way to get the APK is GitHub: upload the project and run the "Build Android app" workflow in the Actions tab. iPhone and iPad: open the address in Safari and choose Share, Add to Home Screen; Aster installs as an app icon.

### Automatic updates (installed Windows app)
Installed copies of Aster check your GitHub repository for a newer release when they start, download it quietly, and ask you to restart. Aster, Check for updates… does it on demand. The portable .exe and `npm start` do not update.
To publish an update: put the new files in your GitHub folder, Commit, then Push origin (GitHub Desktop). GitHub builds the installer by itself (Actions tab, a few minutes) and publishes it as a release. The repository must be public so installed apps can read releases.
Install the first copy from that release (Releases page, the Setup .exe), because it carries your repository's address. One built by hand with `npm run dist:win` works but never updates.

## Focus Lock (desktop app)
Settings, Focus Lock. When it is on, every time the computer starts Aster fills the screen and stays in front of everything until today's work is done:
- today's planner classes ticked (optional),
- the study time reached, counted while you actively use a PDF or video in Aster (optional),
- photos of your handwritten work (with today's date written on the page) approved by your AI key (optional). Photos are shrunk, checked and not kept; a photo cannot be used on two days.

Fair rules: making the lock stricter works at once; making it looser or turning it off takes 24 hours, and settings cannot change while locked. Emergency exit: type a long sentence (no pasting), wait 30 minutes, once every 7 days.

What it cannot do: it is not Windows security. Ctrl+Alt+Del, Task Manager, safe mode, uninstalling Aster or editing its settings file can all get around it. It also only starts with Windows in the installed (Setup) version, not the portable one. Tablets and phones are not locked.
