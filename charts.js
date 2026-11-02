export const PALETTE = [
  '#4a90e2',
  '#ff6fae',
  '#2f6fd0',
  '#ffb3d4',
  '#7fb3f0',
  '#e8458f',
  '#a8d0ff',
  '#ff9ec9',
  '#1b4e9b',
  '#c9307a',
];

const color = (index) => PALETTE[index % PALETTE.length];
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

// Counts only change when she edits them, so each item's line carries its last
// known value forward across every timestamp in the log.
function timeSeries(items, history) {
  const stamps = [...new Set(history.map((entry) => entry.recorded_at))].sort();
  return {
    stamps,
    series: items.map((item) => {
      const changes = new Map(
        history.filter((entry) => entry.item_id === item.id).map((e) => [e.recorded_at, e.count]),
      );
      let carried = 0;
      return stamps.map((stamp) => {
        if (changes.has(stamp)) carried = changes.get(stamp);
        return carried;
      });
    }),
  };
}

const countsOnly = {
  plugins: { legend: { display: false } },
  scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
};

const roundLegend = {
  plugins: { legend: { position: 'right', labels: { boxWidth: 14, usePointStyle: true } } },
};

export const CHART_TYPES = [
  {
    id: 'bar',
    label: 'Bar chart',
    blurb: 'Tall bars make it easy to spot your biggest pile at a glance.',
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
      options: countsOnly,
    }),
  },
  {
    id: 'hbar',
    label: 'Sideways bars',
    blurb: 'Same idea tipped on its side. Handy when your names are long.',
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
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    }),
  },
  {
    id: 'pie',
    label: 'Pie chart',
    blurb: 'One whole pie split into slices. Bigger slice means a bigger share.',
    build: (items) => ({
      type: 'pie',
      data: {
        labels: items.map((item) => item.name),
        datasets: [
          { data: items.map((item) => item.count), backgroundColor: items.map((_, i) => color(i)) },
        ],
      },
      options: roundLegend,
    }),
  },
  {
    id: 'doughnut',
    label: 'Doughnut chart',
    blurb: 'A pie chart with the middle munched out.',
    build: (items) => ({
      type: 'doughnut',
      data: {
        labels: items.map((item) => item.name),
        datasets: [
          { data: items.map((item) => item.count), backgroundColor: items.map((_, i) => color(i)) },
        ],
      },
      options: roundLegend,
    }),
  },
  {
    id: 'polarArea',
    label: 'Polar area',
    blurb: 'Slices fan out from the middle, and the bigger counts reach further.',
    build: (items) => ({
      type: 'polarArea',
      data: {
        labels: items.map((item) => item.name),
        datasets: [
          {
            data: items.map((item) => item.count),
            backgroundColor: items.map((_, i) => fade(color(i), 0.7)),
          },
        ],
      },
      options: roundLegend,
    }),
  },
  {
    id: 'radar',
    label: 'Radar chart',
    blurb: 'A spider web shape. A lopsided web means one thing is way ahead.',
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
      options: { plugins: { legend: { display: false } } },
    }),
  },
  {
    id: 'line',
    label: 'Line chart (over time)',
    blurb: 'Watch your collection climb. Every line is one thing you count.',
    overTime: true,
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
          })),
        },
        options: {
          scales: { x: timeAxis, y: { beginAtZero: true, ticks: { precision: 0 } } },
        },
      };
    },
  },
  {
    id: 'area',
    label: 'Area chart (over time)',
    blurb: 'Lines with the space underneath coloured in, stacked into layers.',
    overTime: true,
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
          })),
        },
        options: {
          scales: {
            x: timeAxis,
            y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
          },
        },
      };
    },
  },
  {
    id: 'scatter',
    label: 'Scatter plot (over time)',
    blurb: 'A dot for every single change you made. No lines, just dots.',
    overTime: true,
    build: (items, history) => ({
      type: 'scatter',
      data: {
        datasets: items.map((item, i) => ({
          label: item.name,
          data: history
            .filter((entry) => entry.item_id === item.id)
            .map((entry) => ({ x: new Date(entry.recorded_at).getTime(), y: entry.count })),
          backgroundColor: color(i),
          pointRadius: 6,
        })),
      },
      options: {
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 6,
              maxRotation: 0,
              callback: (value) => shortTime(new Date(value).toISOString()),
            },
          },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    }),
  },
  {
    id: 'bubble',
    label: 'Bubble chart',
    blurb: 'The more you have, the bigger the bubble grows.',
    build: (items) => {
      const biggest = Math.max(1, ...items.map((item) => item.count));
      return {
        type: 'bubble',
        data: {
          datasets: items.map((item, i) => ({
            label: item.name,
            data: [{ x: i + 1, y: item.count, r: 8 + (item.count / biggest) * 32 }],
            backgroundColor: fade(color(i), 0.65),
            borderColor: color(i),
          })),
        },
        options: {
          scales: {
            x: { display: false, min: 0, max: items.length + 1 },
            // Headroom so the biggest bubble doesn't collide with the legend.
            y: { beginAtZero: true, suggestedMax: biggest * 1.35, ticks: { precision: 0 } },
          },
        },
      };
    },
  },
];
