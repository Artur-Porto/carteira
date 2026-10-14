// Line icons drawn inline, so the app loads nothing from outside.
const svg = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export const HomeIcon = () => (
  <svg {...svg}>
    <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </svg>
);

export const WalletIcon = () => (
  <svg {...svg}>
    <rect x="3" y="6" width="18" height="14" rx="2" />
    <path d="M3 10h18M16 15h2M6 6V4h12v2" />
  </svg>
);

export const PlusIcon = () => (
  <svg {...svg}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

export const ChecklistIcon = () => (
  <svg {...svg}>
    <path d="M10 6h10M10 12h10M10 18h10M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17" />
  </svg>
);

export const MoreIcon = () => (
  <svg {...svg}>
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="19" cy="12" r="1.5" />
  </svg>
);

export const EyeIcon = ({ crossed }: { crossed: boolean }) => (
  <svg {...svg}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {crossed && <path d="M4 4l16 16" />}
  </svg>
);

export const BackIcon = () => (
  <svg {...svg}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const ChevronIcon = () => (
  <svg {...svg}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);
