/**
 * Small inline icon set (stroke icons on a 24px grid). Decorative only: every
 * icon is aria-hidden, and the text next to it carries the meaning.
 */
const PATHS = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  queue: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  detail: "M12 3 2.5 20h19L12 3zM12 10v4M12 17h.01",
  alert: "M12 3 2.5 20h19L12 3zM12 10v4M12 17h.01",
  warning: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v5M12 16h.01",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  inbox: "M4 13l2.5-8h11L20 13v6H4v-6zM4 13h5l1 2h4l1-2h5",
  check: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l2.5 2.5L16 9.5",
  pin: "M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.800 7 11 7 11zM12 12.500a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5z",
  camera: "M4 8h3l1.500-2h7L17 8h3v11H4V8zM12 16.500a3.250 3.250 0 1 0 0-6.500 3.250 3.250 0 0 0 0 6.500z",
  gauge: "M4 18a9 9 0 1 1 16 0M12 14l4-5",
  clipboard: "M9 4h6v3H9zM7 5.500H5V21h14V5.500h-2M9 12h6M9 16h6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  database: "M4 6c0-1.700 3.600-3 8-3s8 1.300 8 3-3.600 3-8 3-8-1.300-8-3zM4 6v6c0 1.700 3.600 3 8 3s8-1.300 8-3V6M4 12v6c0 1.700 3.600 3 8 3s8-1.300 8-3v-6",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  sparkle: "M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800L12 3z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
