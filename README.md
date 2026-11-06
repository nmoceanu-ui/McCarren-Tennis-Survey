# Brooklyn Challenger website

The live site at brooklynchallenger.netlify.app. This branch (`site`) is the new site; the old McCarren survey
site stays on `main` (its own Netlify project, brooklyn-challenger.netlify.app, which now shows a closing note
and keeps the old page at an unlisted address).

- `public/index.html` — the whole page: Home (rally game, what we work on, Work with us + Message us), Courts (map, booking, stringing), Youth (kids' hours, youth program, beginner stages, the 2037 goal), Board, Projects.
- `public/og.png` — the share preview image (1200×630).
- `public/moderate.html` — the moderator page at `/moderate`.
- `netlify/functions/` — the API: `board` (posts, Me too, Fixed now), `checkins` (court check-ins, kept an hour),
  `rally` (Top rallies), `message` (private Message us notes, shown only on the moderator page), `mod` (moderator actions). Data lives in Netlify Blobs (store `bc`); nothing else.
- `netlify/lib/words.mjs` — the word filter. The page carries a copy of the initials lists; `npm test` checks they match.

## Moderator password

Set once in Netlify: Project configuration → Environment variables → Add `MOD_KEY` (at least 8 characters),
then redeploy. Until it is set, posts wait and the moderator page says the password is not set up.

## Local preview and tests

    npm install
    npm test                                   # API + word filter, against a local Blobs server
    MOD_KEY=test-password node test/dev-server.mjs   # http://localhost:8888

## What is stored

Posts (with the optional email, only ever shown on the moderator page), Me too / Still true taps (as hashed
device ids), check-ins for one hour, the leaderboard, private messages (deleted 30 days after they're marked done), and hourly rate-limit counters keyed by a salted hash of
the visitor's IP (swept after two hours). No accounts, no cookies.
