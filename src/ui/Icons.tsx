import React from 'react';

const paths = {
  plus: 'M12 5v14M5 12h14',
  search: 'M21 21l-4.6-4.6M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
  home: 'M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1V10',
  folder: 'M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7',
  chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H8l-5 2 1.5-5A8.5 8.5 0 1 1 21 11.5',
  chevron: 'M9 5l7 7-7 7',
  down: 'M6 9l6 6 6-6',
  sidebar: 'M5 4v16M18 6l-6 6 6 6',
  showSidebar: 'M5 4v16M11 6l6 6-6 6',
  settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  shield: 'M12 3l8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6l8-3Z',
  tasks: 'M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1',
  file: 'M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8l-6-6Zm0 0v6h6M8 13h8M8 17h8',
  more: 'M4 12h.01M12 12h.01M20 12h.01',
  copy: 'M9 5h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM15 2H5a1 1 0 0 0-1 1v13',
  like: 'M8 21H3V10h5m0 0 4-8c2 0 3 1 3 3l-1 5h6c1 0 2 1 1.8 2L20 19c-.2 1-1 2-2 2H8V10Z',
  image: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM3 17l6-6 4 4 3-3 5 5M8 7h.01',
  arrowUp: 'M12 20V4M5 11l7-7 7 7',
  arrowDown: 'M12 4v16M5 13l7 7 7-7',
  check: 'M5 12l4 4L19 6',
  close: 'M6 6l12 12M6 18 18 6',
  refresh: 'M20 7v5h-5M4 17v-5h5M5.5 6a8 8 0 0 1 13 .5L20 12M4 12l1.5 5.5a8 8 0 0 0 13 .5',
  stop: 'M6 6h12v12H6Z',
  clock: 'M12 7v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  warning: 'M12 3l10 18H2L12 3Zm0 6v5m0 3h.01',
  branch: 'M6 6v12M18 6v3c0 4-12 3-12 7M9 3a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM21 3a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
} as const;
export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg className={'ui-icon ' + className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export function BrandMark({ className = '' }: { className?: string }) {
  return <svg className={'brand-mark ' + className} width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M5 26V7l11 10L27 7v19" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m5 7 11 10L27 7" stroke="#d6f0e4" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
