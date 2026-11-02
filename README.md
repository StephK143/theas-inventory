# Thea's Inventory

A single-page inventory tracker for a 9-year-old: tabbed lists on the left,
a pick-your-own chart on the right, and a printable "official" report
underneath. Plain HTML, CSS and JavaScript with no build step, so GitHub Pages
can serve it straight from the repo.

## Running it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 4173   # then visit http://localhost:4173
```

Until Supabase is configured the page runs in **practice mode** and saves to
`localStorage`, so everything works offline and nothing is lost by poking at it.

## Connecting Supabase

1. Run `schema.sql` in the Supabase dashboard under **SQL Editor -> New query**.
   It creates four `thea_` prefixed tables and opens them to anonymous access.
2. Copy the project URL and anon key from **Project Settings -> API** into
   `config.js`.

The badge in the top right flips to "Saved to the cloud" once it connects. If
Supabase can't be reached the page falls back to browser storage rather than
breaking.

## Publishing to GitHub Pages

The repo must be public on a free GitHub plan. Then under
**Settings -> Pages**, set the source to `main` / `/ (root)`. The site lands at
`https://stephk143.github.io/theas-inventory/`.

## How the data fits together

| Table            | Holds                                                     |
| ---------------- | --------------------------------------------------------- |
| `thea_tabs`      | One row per list across the top, with its accent colour   |
| `thea_items`     | The things being counted, belonging to a tab              |
| `thea_count_log` | A row per count change, written by a database trigger     |
| `thea_reports`   | Saved write-ups, one list's worth at a time               |

`thea_count_log` is what makes the over-time charts possible. Bar, pie,
doughnut, polar, radar and bubble charts read current counts; line, area and
scatter read the log.

## Adding a chart type

Append an entry to `CHART_TYPES` in `charts.js` with an `id`, a `label`, a
kid-readable `blurb`, and a `build(items, history)` that returns a Chart.js
config. Set `overTime: true` if it needs the log. The dropdown and the empty
state pick it up automatically.

## A note on access

There is no login. Anyone who has the URL can read and edit every list, and the
anon key in `config.js` is visible to anyone viewing source. That is a
deliberate trade for a kid's project. The database policies in `schema.sql`
only grant access to the four `thea_` tables, so nothing else in the Supabase
project is exposed.
