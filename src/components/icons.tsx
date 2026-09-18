import type { ReactNode, SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

function Svg({ className = 'h-5 w-5', children, ...rest }: P & { children?: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: P) => (
  <Svg {...p}>
    <path d="m3 10.5 9-7.5 9 7.5" />
    <path d="M5 9v12h14V9" />
    <path d="M9 21v-6h6v6" />
  </Svg>
);

export const ClipboardIcon = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
    <path d="M9 10h6" />
    <path d="M9 14h6" />
    <path d="M9 18h3" />
  </Svg>
);

export const UsersIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
    <path d="M21.5 20a6.5 6.5 0 0 0-4.5-6.2" />
  </Svg>
);

export const ReceiptIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z" />
    <path d="M9 8h6" />
    <path d="M9 12h6" />
  </Svg>
);

export const PlusIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Svg>
);

export const ChevronRightIcon = (p: P) => (
  <Svg {...p}>
    <path d="m9 6 6 6-6 6" />
  </Svg>
);

export const TrashIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="m6 7 1 14h10l1-14" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
  </Svg>
);

export const WrenchIcon = (p: P) => (
  <Svg {...p}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </Svg>
);

export const PhoneIcon = (p: P) => (
  <Svg {...p}>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z" />
  </Svg>
);

export const MailIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </Svg>
);

export const MapPinIcon = (p: P) => (
  <Svg {...p}>
    <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z" />
    <circle cx="12" cy="10" r="3" />
  </Svg>
);

export const PrinterIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 9V3h12v6" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </Svg>
);

export const CheckIcon = (p: P) => (
  <Svg {...p}>
    <path d="m5 12 5 5L20 7" />
  </Svg>
);

export const CarIcon = (p: P) => (
  <Svg {...p}>
    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L16 10l-2.7-4.5A2 2 0 0 0 11.7 4H6.6a2 2 0 0 0-1.9 1.4L3 10c-.7.2-1.4 1-1.4 1.9V16c0 .6.4 1 1 1h2" />
    <circle cx="7" cy="17" r="2" />
    <circle cx="17" cy="17" r="2" />
    <path d="M9 17h6" />
  </Svg>
);

export const CalendarIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
    <path d="M3 10h18" />
  </Svg>
);

export const ArrowLeftIcon = (p: P) => (
  <Svg {...p}>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </Svg>
);
