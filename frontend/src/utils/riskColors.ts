import type { RiskLevel } from '../types/routing';

export const RISK_COLOR_MAP: Record<
  RiskLevel,
  {
    hex: string;
    rgb: [number, number, number];
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    dotClass: string;
  }
> = {
  Low: {
    hex: '#146C43',
    rgb: [20, 108, 67],
    badgeBg: 'bg-[#E6F3EC]',
    badgeText: 'text-[#0E5132]',
    badgeBorder: 'border-[#B7DCC6]',
    dotClass: 'bg-[#146C43]',
  },
  Moderate: {
    hex: '#A16207',
    rgb: [161, 98, 7],
    badgeBg: 'bg-[#FBF3D8]',
    badgeText: 'text-[#7A4D05]',
    badgeBorder: 'border-[#E6D394]',
    dotClass: 'bg-[#A16207]',
  },
  High: {
    hex: '#C2410C',
    rgb: [194, 65, 12],
    badgeBg: 'bg-[#FDE8D8]',
    badgeText: 'text-[#9A3412]',
    badgeBorder: 'border-[#F0C4A6]',
    dotClass: 'bg-[#C2410C]',
  },
  Severe: {
    hex: '#B42318',
    rgb: [180, 35, 24],
    badgeBg: 'bg-[#FDE8E6]',
    badgeText: 'text-[#8E1B14]',
    badgeBorder: 'border-[#F0B8B2]',
    dotClass: 'bg-[#B42318]',
  },
  'No Travel': {
    hex: '#9F1239',
    rgb: [159, 18, 57],
    badgeBg: 'bg-[#FBE7EE]',
    badgeText: 'text-[#9F1239]',
    badgeBorder: 'border-[#E7B3C4]',
    dotClass: 'bg-[#9F1239]',
  },
};

export function getScoreColorClasses(score: number): {
  text: string;
  ring: string;
  bg: string;
  label: string;
} {
  if (score >= 82) {
    return {
      text: 'text-[#0E5132]',
      ring: 'border-[#B7DCC6]',
      bg: 'bg-[#E6F3EC]',
      label: 'Favorable',
    };
  }
  if (score >= 65) {
    return {
      text: 'text-[#7A4D05]',
      ring: 'border-[#E6D394]',
      bg: 'bg-[#FBF3D8]',
      label: 'Caution',
    };
  }
  if (score >= 45) {
    return {
      text: 'text-[#9A3412]',
      ring: 'border-[#F0C4A6]',
      bg: 'bg-[#FDE8D8]',
      label: 'Elevated',
    };
  }
  if (score >= 25) {
    return {
      text: 'text-[#8E1B14]',
      ring: 'border-[#F0B8B2]',
      bg: 'bg-[#FDE8E6]',
      label: 'Severe',
    };
  }
  return {
    text: 'text-[#9F1239]',
    ring: 'border-[#E7B3C4]',
    bg: 'bg-[#FBE7EE]',
    label: 'Hold',
  };
}

export function formatDuration(minutes: number): string {
  const totalMins = Math.round(minutes);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

export function formatEtaTimestamp(iso: string): string {
  try {
    const dt = new Date(iso);
    return dt.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}
