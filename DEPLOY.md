# Courts Back at McCarren — deployment with the live counter

What this folder is: the campaign page (`public/index.html`, its images and the two 3D models), the counter
client (`public/counter.js`), the same-origin proxy (`netlify/functions/counter.mjs`), the Apps Script that
turns the Google Form's response sheet into counts (`Code.gs`), and GPT's design notes
(`COUNTER_README_from_GPT.md`). Tests: `node test-counter.mjs` (synthetic data only).

Order of work: Google Form → response Sheet → Apps Script → Netlify. About an hour the first time.

## 1. Google Form

Build the six-item form. The counter reads the response sheet by column title, so the question titles must be
exactly these (copy and paste them):

| # | Question title (exact) | Type |
| --- | --- | --- |
| 1 | `ZIP code where you live` | Short answer, validation: regular expression `^[0-9]{5}$`, required |
| 2 | `Your connection to North Brooklyn` | Multiple choice, required: `I live here` / `I work or study here` / `I come here to play tennis, pickleball or padel` / `I visit for other reasons` |
| 3 | `Should NYC Parks include new public tennis courts in the lot design?` | Multiple choice, required: `Strongly support` / `Support` / `No opinion` / `Oppose` / `Strongly oppose` |
| 4 | `What do you play?` | Checkboxes, required: `Tennis` / `My child plays tennis` / `Padel or pickleball` / `I'd like to learn tennis` / `I don't play racquet sports` |
| 5 | `What keeps you from playing tennis at McCarren today?` | Checkboxes, optional, no selection limit: `Courts are always taken` / `Court conditions` / `Winter indoor courts cost too much` / `Too far from home` / `I play padel or pickleball instead` / `Nothing, I play there` / `I don't play tennis` / `Other` |
| 6 | `Email` | Short answer, validation: text, email address, required |
| 7 | `Add my name to the community letter to NYC Parks asking for public courts on the lot` | Checkbox, optional (the counter never reads it) |
| 8 | `Name (first name and last initial), only if you ticked the box above` | Short answer, optional (never read) |

Settings: do NOT turn on "Collect email addresses" (question 6 does it) and do NOT "Limit to 1 response"
(forces Google sign-in). Shuffle option order off. Responses → do not show summary to respondents.
Confirmation message: "Thank you. Results go to NYC Parks, Community Board 1 and Council District 33 after the
survey closes on November 10."

Then Responses → Link to Sheets. Keep the Form and the Sheet private to organizers.

## 2. Response Sheet

In the sheet tab `Form Responses 1`, add two columns at the right, titled exactly `Collection mode` and
`Exclude reason`. Protect them (Data → Protect sheets and ranges) so only organizers edit them. Leave them
blank for online responses. For a paper form you type in, put `paper` in Collection mode on that row. To take a
row out of the count (test entry, documented duplicate), write the reason in Exclude reason; never delete rows.

Copy the sheet ID from its URL: the long string between `/d/` and `/edit`.

## 3. Apps Script (the counter)

1. In the Sheet: Extensions → Apps Script. Delete the sample code, paste all of `Code.gs`, save.
2. At the top of the script, check `CFG.sheet` (`Form Responses 1`) and every title in `CFG.headers` against
   the actual column titles in row 1 of the sheet. They must match character for character. If you changed any
   question or option wording, change it here too. `CFG.opens` is the first moment responses count; set it to
   the day you publish the site.
3. Project Settings (gear) → Script Properties → Add: `SPREADSHEET_ID` = the ID from step 2. Set the project
   time zone to America/New_York.
4. Run `rebuildCounter` once (select it in the toolbar, Run). Authorize when asked.
5. Run `installCounterTrigger` once. It recomputes every five minutes.
6. Deploy → New deployment → type Web app → Execute as: Me; Who has access: Anyone. Copy the `/exec` URL. Open
   it in a private browser window: you should see JSON with counts only, no emails.
7. Any later code change: Deploy → Manage deployments → edit → new version.

The script publishes counts only: participants, supporters (Support + Strongly support), the audience split,
paper vs online, and the five opinion totals. No names, emails or rows ever leave the sheet.

## 4. Netlify

1. Put this folder in a Git repository (GitHub is fine) and create a Netlify site from it, or use the Netlify
   CLI (`netlify deploy --prod`). A drag-and-drop upload of `public/` alone will NOT deploy the function.
2. Site configuration → Environment variables → add `COUNTER_UPSTREAM` = the Apps Script `/exec` URL. Redeploy.
3. Open `https://<your-site>/.netlify/functions/counter` in a private window: counts JSON. If it says
   `counter_unavailable`, the variable is missing, the Apps Script is not deployed to Anyone, or the schema
   check failed (a header mismatch in step 3.2).
4. The counter sits at the top of the page. It polls the function every three minutes while the page is open and
   shows "Updated <time>". If the function is down, it shows the last count it saw with a "delayed" label, or
   "temporarily unavailable" to a first-time visitor. It never shows an invented number. A real zero is shown
   as zero.

## 5. The page itself

- Survey link: in `public/index.html`, near the bottom, replace `https://forms.gle/REPLACE` with the Google
  Form link. Until then the buttons scroll to the survey section instead of opening a form.
- Contact: add an address to the survey section and footer, or give me the address.
- 1947 photo: on the page with its credit, but publication needs the Center for Brooklyn History's permission.
  Remove its `<figure>`, or swap in a cleared image, if that has not come through by launch.
- 3D models: `public/models/*.gltf.json` are generated from the SketchUp generator's geometry. Replace them with
  glTF exports from SketchUp when you have them (same file names), or send them to me.
- After Nov 10 at 9pm: close the Form (Responses → Accepting responses off), run `finalizeCounter` in Apps
  Script after reconciling the sheet, and change the page's buttons to a closed message with the results link.

## 6. Counting rules the page states (keep them true)

One eligible response per email (earliest wins; lowercased, trimmed). Residents = "I live here" with ZIP
11211, 11222, 11249, 11206 or 11237, self-reported, not verified. Visiting racquet-sport players = the
"I come here to play" answer regardless of ZIP. Supporters = Support + Strongly support only. Paper forms are
entered by organizers and tagged `paper`. Responses outside the window in `CFG.opens` / `CFG.closes` (Nov 10,
21:00 New York time) do not count. Opposing responses count as participants.
