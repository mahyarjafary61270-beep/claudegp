export interface RadioStation {
  id: string;
  name: string;
  /** Stream URL (24/7 mp3/aac stream) */
  url: string;
  emoji: string;
  color: string;
  /** AzuraCast shortcode used for the now-playing API: /api/nowplaying/<shortcode> */
  shortcode: string;
}

export const RADIO_STATIONS: RadioStation[] = [
  {
    id: 'popularfa',
    name: 'Popular FA',
    url: 'https://stream.radiox.pro/listen/popularfa/radio.mp3',
    emoji: '🔥',
    color: '#ff4d8d',
    shortcode: 'popularfa',
  },
  {
    id: 'shooti',
    name: 'Shooti',
    url: 'https://stream.radiox.pro/listen/shooti/radio.mp3',
    emoji: '🏹',
    color: '#a78bfa',
    shortcode: 'shooti',
  },
  {
    id: 'popular',
    name: 'Popular',
    url: 'https://stream.radiox.pro/listen/popular/radio.mp3',
    emoji: '🎧',
    color: '#22d3ee',
    shortcode: 'popular',
  },
  {
    id: 'sad',
    name: 'Sad',
    url: 'https://stream.radiox.pro/listen/sad/radio.mp3',
    emoji: '🌧️',
    color: '#818cf8',
    shortcode: 'sad',
  },
];

export function getStation(id: string): RadioStation | undefined {
  return RADIO_STATIONS.find((s) => s.id === id);
}

export function nowPlayingUrl(shortcode: string): string {
  return `https://stream.radiox.pro/api/nowplaying/${shortcode}`;
}

/** Allowed avatar accent colors */
export const ACCENT_COLORS = [
  '#ff4d8d',
  '#a78bfa',
  '#22d3ee',
  '#34d399',
  '#fbbf24',
  '#f87171',
  '#60a5fa',
  '#e879f9',
];
