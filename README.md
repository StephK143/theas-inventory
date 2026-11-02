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

## Supabase

Already connected to the `theas-inventory` project, with `schema.sql` applied
and the keys in `config.js`. The badge in the top right reads "Saved to the
cloud" when it connects; if Supabase can't be reached the page falls back to
browser storage rather than breaking. Blanking out `config.js` forces that
**practice mode** on purpose, which is handy for experimenting without
touching real data.

To rebuild the database from scratch, re-run `schema.sql` in the dashboard
under **SQL Editor -> New query**. It is idempotent, so running it twice is
harmless.

## Publishing to GitHub Pages

The repo must be public on a free GitHub plan. Then under
**Settings -> Pages**, set the source to `main` / `/ (root)`. The site lands at
`https://stephk143.github.io/theas-inventory/`.

## How the data fits together

| Table            | Holds                                                     |
| ---------------- | --------------------------------------------------------- |
| `thea_tabs`      | One row per list across the top, with its accent colour   |
| `thea_items`     | The things being counted, belonging to a tab              |
| `thea_count_log` | A row per count change, written by an after-insert trigger |
| `thea_reports`   | Saved write-ups, one list's worth at a time               |

`thea_count_log` is what makes the over-time charts possible. Bar, pie,
doughnut, polar, radar and bubble charts read current counts; line, area and
scatter read the log.

## Long lists

Lists are built to handle a hundred items or more. The inventory table scrolls
with a sticky header, and the second dropdown above the chart picks how many
things to plot, defaulting to the biggest ten. Share-style charts (pie,
doughnut, polar, radar, bubble) roll the remainder into a grey "Everything
else" slice so the total stays truthful; the others just show the top slice of
the list and say how many are hidden. Sideways bars grow taller a row at a
time, so "Show all" with 120 items is a tall readable chart rather than 120
slivers.

## Adding a chart type

Append an entry to `CHART_TYPES` in `charts.js` with an `id`, a `label`, a
kid-readable `blurb`, and a `build(items, history)` that returns a Chart.js
config. The dropdown and empty state pick it up automatically. Optional keys:

- `overTime: true` if it reads `thea_count_log` rather than current counts
- `grouping: 'other' | 'drop'` for how to handle items beyond the chosen limit
- `height(count)` to grow the canvas for long lists

## When saving fails

Every database call has a 12 second timeout and reports failure as a pink
message along the bottom of the screen. Buttons disable while a save is in
flight, which matters because the original silent-failure bug let repeated
clicks insert the same row several times over.

## A note on access

There is no login. Anyone who has the URL can read and edit every list, and the
anon key in `config.js` is visible to anyone viewing source. That is a
deliberate trade for a kid's project. The database policies in `schema.sql`
only grant access to the four `thea_` tables, so nothing else in the Supabase
project is exposed.
