// Interpolate RGB stops in JS so the same scale works in Chromium 68.
const stops = [
  { rating: 4, color: [255, 53, 69] },
  { rating: 5.5, color: [173, 146, 151] },
  { rating: 6.4, color: [156, 160, 170] },
  { rating: 7.5, color: [244, 189, 104] },
  { rating: 8.5, color: [158, 216, 131] },
  { rating: 10, color: [82, 214, 160] },
];

export function ratingStyle(value: string | number | undefined) {
  const parsed = Number(String(value ?? '').trim().replace(',', '.'));
  const rating = value == null || String(value).trim() === '' || !Number.isFinite(parsed)
    ? 6.4 : Math.max(0, Math.min(10, parsed));
  const upper = stops.findIndex(stop => rating <= stop.rating);
  const to = stops[upper];
  const from = stops[Math.max(0, upper - 1)];
  const progress = to.rating === from.rating ? 0 : (rating - from.rating) / (to.rating - from.rating);
  const color = from.color.map((channel, index) => Math.round(channel + (to.color[index] - channel) * progress));
  return { 'background-color': `rgb(${color.join(', ')})`, color: '#1b1418' };
}
