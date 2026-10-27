# Connect Aster to your Google Sheets

Do this once. It takes about five minutes. After it, ticking a box in Aster ticks the same box in your Google Sheet, and ticking in the sheet shows up in Aster.

## How it works

A small script (`sync/Code.gs`) lives in your own Google account. It is the only thing that can open your four sheets. Aster talks to that script with a web address and an access code that only you know.

- Aster to sheet: when you tick a box or edit "My notes" on a class, Aster sends it to the script about a second later. The script writes only those cells (tick boxes B to E, notes M) on that class row.
- Sheet to Aster: Aster asks for the latest sheet every 45 seconds while it is open, and again whenever you switch back to the tab.
- If you are offline, ticks wait on your device and are sent when the connection returns.
- If you insert or delete rows in a sheet, Aster refuses to write to a row that no longer holds the same class, and shows the sheet's version instead. It never writes to the wrong row.

## Steps

1. Sign in to the Google account that owns the four sheets. Go to <https://script.google.com> and choose **New project**.
2. Delete the code in the editor. Open `sync/Code.gs` from this folder, copy everything, and paste it in.
3. Near the top, replace `CHANGE-ME-to-a-long-random-phrase` with your own long phrase (for example three random words and some digits). This is your **access code**. Keep it private.
4. Check the four sheet IDs in `SPREADSHEET_IDS`. They are already filled in from the links you sent. Each is the long text between `/d/` and `/edit` in a sheet's address.
5. Click **Deploy**, then **New deployment**. Click the gear icon and choose **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**.
6. Google asks you to authorise. Click **Authorize access**, pick your account, then **Advanced**, then **Go to (project name) (unsafe)**, then **Allow**. The warning is normal for a script you wrote yourself.
7. Copy the **Web app URL**. It ends in `/exec`.
8. Open Aster, go to **Settings**, paste the URL and your access code, and click **Save and connect**. The chip at the bottom left should turn to **Synced**.

"Anyone" means anyone who has both the URL and the access code can read and tick your sheets. Do not share either. If they leak, change `TOKEN`, then **Deploy**, **Manage deployments**, the pencil icon, **New version**, and update Settings.

## If you change the script later

**Deploy**, **Manage deployments**, the pencil icon, **Version: New version**, **Deploy**. The URL stays the same.

## Problems

| What you see | What it means |
| --- | --- |
| "The sync URL did not return data" | The URL is wrong, or "Who has access" is not **Anyone**. Redeploy and copy the `/exec` URL again. |
| "Wrong access code" | The code in Settings differs from `TOKEN` in the script. They must match exactly. |
| "Cell B2 ... must contain the subject code" | A sheet's title cell B2 was changed. It must look like `Maths  (0580)`. |
| "N changes could not be saved because the sheet rows moved" | Rows were inserted or deleted in the sheet. Aster dropped those changes and now shows the sheet. Tick them again. |
| Chip says "Offline, N waiting" | No connection or Google is busy. Your ticks are safe on this device and are sent automatically. |

## What is and is not synced

- Synced both ways: the four tick boxes per class, and "My notes" on a class.
- Read from the sheet: topics, class names, dates, recording links, passcodes, the "Not taught yet" section, and the playlist links.
- Stays on this device only: past paper log, free notes, and your PDF/Drive folder links. Use **Settings, Download backup** now and then.

## Adding English or another subject

Make its sheet in the same layout (title in B2 like `English Language  (0500)`, the same columns, class rows from row 11). Add its ID to `SPREADSHEET_IDS`, redeploy a new version, and it appears in Aster.
