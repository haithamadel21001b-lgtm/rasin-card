import type { SVGProps } from 'react';

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, ...p,
});

export const IHome = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" /></svg>
);
export const IChart = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 20V11M12 20V5M19 20v-6" /></svg>
);
export const IGear = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
);
export const IClose = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IUndo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
);
export const IFlame = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 21c-3.9 0-7-2.7-7-6.6 0-3 2-5 3.4-6.6.3 1.6 1.2 2.8 2.4 3.3C10.4 7.6 12 4.6 14.6 3c-.3 2.4.5 4.4 2.1 6.1 1.4 1.5 2.3 3.2 2.3 5.3C19 18.3 15.9 21 12 21z" /></svg>
);
export const IShare = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3v12M8 7l4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" /></svg>
);
export const ICheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const ICloudOff = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 3l18 18M8.5 6.3A6 6 0 0 1 17.7 10H18a4 4 0 0 1 2.3 7.3M17 18H7a5 5 0 0 1-1.5-9.8" /></svg>
);

/** Eight-petal rosette, after the glazed-brick rosettes of the Ishtar Gate. */
export function Rosette({ size = 44, petal = '#fff', center = '#c9932e', opacity = 1 }: { size?: number; petal?: string; center?: string; opacity?: number }) {
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" aria-hidden style={{ opacity }}>
      {Array.from({ length: 8 }, (_, i) => (
        <ellipse key={i} cx="0" cy="-24" rx="10.5" ry="21" fill={petal} transform={`rotate(${i * 45})`} />
      ))}
      <circle r="12" fill={center} />
      <circle r="5" fill={petal} opacity="0.55" />
    </svg>
  );
}

export function rosettePattern() {
  const petals = Array.from({ length: 8 }, (_, i) =>
    `<ellipse cx="0" cy="-13" rx="5.6" ry="11.5" fill="#ffffff" fill-opacity="0.08" transform="rotate(${i * 45})"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="92" height="92" viewBox="-46 -46 92 92">${petals}<circle r="5" fill="#c9932e" fill-opacity="0.32"/><circle cx="-46" cy="-46" r="2" fill="#ffffff" fill-opacity="0.12"/><circle cx="46" cy="46" r="2" fill="#ffffff" fill-opacity="0.12"/><circle cx="-46" cy="46" r="2" fill="#ffffff" fill-opacity="0.12"/><circle cx="46" cy="-46" r="2" fill="#ffffff" fill-opacity="0.12"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
