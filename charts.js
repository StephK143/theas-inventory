// Blues and pinks alternating, so neighbouring slices and bars never blur
// together. Long lists cycle through these again at a different position.
export const PALETTE = [
  '#2f6fd0',
  '#ff6fae',
  '#1b4e9b',
  '#ffb3d4',
  '#4a90e2',
  '#c9307a',
  '#a8d0ff',
  '#e8458f',
  '#7fb3f0',
  '#ff9ec9',
  '#5b4bd6',
  '#ffd6e8',
  '#6ea8ff',
  '#d14ba8',
  '#cfe4ff',
  '#8f7ae8',
];

const OTHER_ID = '__everything_else__';

const GREY = '#b9c4d4';

const color = (index) => PALETTE[index % PALETTE.length];

// The grouped remainder gets a neutral colour so it reads as "the rest"
// rather than as one more thing she owns.
const colorsFor = (items) =>
  items.map((item, index) => (item.id === OTHER_ID ? GREY : color(index)));
const fade = (hex, alpha) => {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

const shortTime = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

// Edits often land within the same minute, so thinning the labels keeps the
// axis from turning into a wall of identical timestamps.
const timeAxis = { ticks: { maxTicksLimit: 6, maxRotation: 0, autoSkip: true } };
const countAxis = { beginAtZero: true, ticks: { precision: 0 } };

// A long list would otherwise draw one label per bar and turn the axis into
// unreadable mush, so let Chart.js thin them out.
const crowdedAxis = (count) => ({
  ticks: count > 18 ? { autoSkip: true, maxRotation: 60, minRotation: 45 } : { maxRotation: 0 },
});

const legendFor = (count) =>
  count > 14
    ? { display: false }
    : { position: 'right', labels: { boxWidth: 14, usePointStyle: true } };

function downsample(list, max) {
  if (list.length <= max) return list;
  const step = (list.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => list[Math.round(i * step)]);
}

// Counts only change when she edits them, so each item's line carries its last
// known value forward. Sampling the timestamps keeps a long history from
// drawing thousands of points nobody can read.
function timeSeries(items, history, maxPoints = 60) {
  const stamps = downsample([...new Set(history.map((entry) => entry.recorded_at))].sort(), maxPoints);

  return {
    stamps,
    series: items.map((item) => {
      const changes = history
        .filter((entry) => entry.item_id === item.id)
        .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));

      let next = 0;
      let carried = 0;
      return stamps.map((stamp) => {
        while (next < changes.length && changes[next].recorded_at <= stamp) {
          carried = changes[next].count;
          next += 1;
        }
        return carried;
      });
    }),
  };
}

// Trims a long list down to what the chosen chart can actually show. Share-style
// charts keep the total honest by rolling the remainder into one slice; the
// others simply drop the small fry and say so.
export function prepareItems(definition, items, limit) {
  if (!limit || items.length <= limit) return { items, note: '' };

  const ranked = [...items].sort((a, b) => b.count - a.count);
  const shown = ranked.slice(0, limit);
  const hidden = ranked.slice(limit);
  const remainder = hidden.reduce((sum, item) => sum + item.count, 0);

  if (definition.grouping === 'other' && remainder > 0) {
    return {
      items: [...shown, { id: OTHER_ID, name: 'Everything else', count: remainder }],
      note: `Biggest ${limit} shown. The other ${hidden.length} are added together as "Everything else".`,
    };
  }

  return {
    items: shown,
    note: `Biggest ${limit} shown. ${hidden.length} more are hidden — choose "All" to see every one.`,
  };
}

export const CHART_TYPES = [
  {
    id: 'bar',
    label: 'Bar chart',
    blurb: 'Tall bars make it easy to spot your biggest pile at a glance.',
    grouping: 'drop',
    build: (items) => ({
      type: 'bar',
      data: {
        labels: items.map((item) => item.name),
        datasets: [
          {
            data: items.map((item) => item.count),
            backgroundColor: items.map((_, i) => color(i)),
            borderRadius: 8,
          },
        ],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { x: crowdedAxis(items.length), y: countAxis },
      },
    }),
  },
  {
    id: 'hbar',
    label: 'Sideways bars',
    blurb: 'Best for a long list, because every name has room to be read.',
    grouping: 'drop',
    // Grows a row at a time so 100 items stay legible instead of squashing.
    height: (count) => Math.max(300, 70 + count * 26),
    build: (items) => ({
      type: 'bar',
      data: {
        labels: items.map((item) => item.name),
        datasets: [
          {
            data: items.map((item) => item.count),
            backgroundColor: items.map((_, i) => color(i)),
            borderRadius: 8,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: countAxis, y: { ticks: { autoSkip: false } } },
      },
    }),
  },
  {
    id: 'pie',
    label: 'Pie chart',
    blurb: 'One whole pie split into slices. Bigger slice means a bigger share.',
    grouping: 'other',
    build: (items) => ({
      type: 'pie',
      data: {
        labels: items.map((item) => item.name),
        datasets: [{ data: items.map((item) => item.count), backgroundColor: colorsFor(items) }],
      },
      options: { plugins: { legend: legendFor(items.length) } },
    }),
  },
  {
    id: 'doughnut',
    label: 'Doughnut chart',
    blurb: 'A pie chart with the middle munched out.',
    grouping: 'other',
    build: (items) => ({
      type: 'doughnut',
      data: {
        labels: items.map((item) => item.name),
        datasets: [{ data: items.map((item) => item.count), backgroundColor: colorsFor(items) }],
      },
      options: { plugins: { legend: legendFor(items.length) } },
    }),
  },
  {
    id: 'polarArea',
    label: 'Polar area',
    blurb: 'Slices fan out from the middle, and the bigger counts reach further.',
    grouping: 'other',
    build: (items) => ({
      type: 'polarArea',
      data: {
        labels: items.map((item) => item.name),
        datasets: [
          {
            data: items.map((item) => item.count),
            backgroundColor: colorsFor(items).map((hex) => fade(hex, 0.7)),
          },
        ],
      },
      options: { plugins: { legend: legendFor(items.length) } },
    }),
  },
  {
    id: 'radar',
    label: 'Radar chart',
    blurb: 'A spider web shape. A lopsided web means one thing is way ahead.',
    grouping: 'other',
    build: (items) => ({
      type: 'radar',
      data: {
        labels: items.map((item) => item.name),
        datasets: [
          {
            label: 'How many',
            data: items.map((item) => item.count),
            borderColor: PALETTE[1],
            backgroundColor: fade(PALETTE[0], 0.35),
            pointBackgroundColor: PALETTE[1],
          },
        ],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: { r: { pointLabels: { font: { size: items.length > 16 ? 8 : 11 } } } },
      },
    }),
  },
  {
    id: 'line',
    label: 'Line chart (over time)',
    blurb: 'Watch your collection climb. Every line is one thing you count.',
    overTime: true,
    grouping: 'drop',
    build: (items, history) => {
      const { stamps, series } = timeSeries(items, history);
      return {
        type: 'line',
        data: {
          labels: stamps.map(shortTime),
          datasets: items.map((item, i) => ({
            label: item.name,
            data: series[i],
            borderColor: color(i),
            backgroundColor: color(i),
            tension: 0.3,
            pointRadius: stamps.length > 30 ? 0 : 3,
          })),
        },
        options: {
          plugins: { legend: legendFor(items.length) },
          scales: { x: timeAxis, y: countAxis },
        },
      };
    },
  },
  {
    id: 'area',
    label: 'Area chart (over time)',
    blurb: 'Lines with the space underneath coloured in, stacked into layers.',
    overTime: true,
    grouping: 'drop',
    build: (items, history) => {
      const { stamps, series } = timeSeries(items, history);
      return {
        type: 'line',
        data: {
          labels: stamps.map(shortTime),
          datasets: items.map((item, i) => ({
            label: item.name,
            data: series[i],
            borderColor: color(i),
            backgroundColor: fade(color(i), 0.45),
            fill: true,
            tension: 0.3,
            pointRadius: stamps.length > 30 ? 0 : 3,
          })),
        },
        options: {
          plugins: { legend: legendFor(items.length) },
          scales: { x: timeAxis, y: { ...countAxis, stacked: true } },
        },
      };
    },
  },
  {
    id: 'scatter',
    label: 'Scatter plot (over time)',
    blurb: 'A dot for every single change you made. No lines, just dots.',
    overTime: true,
    grouping: 'drop',
    build: (items, history) => ({
      type: 'scatter',
      data: {
        datasets: items.map((item, i) => ({
          label: item.name,
          data: history
            .filter((entry) => entry.item_id === item.id)
            .map((entry) => ({ x: new Date(entry.recorded_at).getTime(), y: entry.count })),
          backgroundColor: color(i),
          pointRadius: items.length > 20 ? 3 : 6,
        })),
      },
      options: {
        plugins: { legend: legendFor(items.length) },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 6,
              maxRotation: 0,
              callback: (value) => shortTime(new Date(value).toISOString()),
            },
          },
          y: countAxis,
        },
      },
    }),
  },
  {
    id: 'bubble',
    label: 'Bubble chart',
    blurb: 'The more you have, the bigger the bubble grows.',
    grouping: 'other',
    build: (items) => {
      const biggest = Math.max(1, ...items.map((item) => item.count));
      const span = Math.min(42, Math.max(10, 420 / Math.max(1, items.length)));
      const colors = colorsFor(items);
      return {
        type: 'bubble',
        data: {
          datasets: items.map((item, i) => ({
            label: item.name,
            data: [{ x: i + 1, y: item.count, r: 6 + (item.count / biggest) * span }],
            backgroundColor: fade(colors[i], 0.65),
            borderColor: colors[i],
          })),
        },
        options: {
          plugins: { legend: legendFor(items.length) },
          scales: {
            x: { display: false, min: 0, max: items.length + 1 },
            // Headroom so the biggest bubble doesn't collide with the legend.
            y: { ...countAxis, suggestedMax: biggest * 1.35 },
          },
        },
      };
    },
  },
];
