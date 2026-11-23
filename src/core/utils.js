export const STATIONS = [
  'Beograd Centar',
  'Lapovo',
  'Niš',
  'Dimitrovgrad',
  'Subotica',
];

export function formatTimeSr(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('sr-Latn-RS', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTimeSr(iso) {
  const d = new Date(iso);
  return d.toLocaleString('sr-Latn-RS', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatHours(h) {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

export function toLocalInputValue(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
