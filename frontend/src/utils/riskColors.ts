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
    hex: '#10b981',
    rgb: [16, 185, 129],
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-300',
    badgeBorder: 'border-emerald-500/35',
    dotClass: 'bg-emerald-400',
  },
  Moderate: {
    hex: '#eab308',
    rgb: [234, 179, 8],
    badgeBg: 'bg-yellow-500/15',
    badgeText: 'text-yellow-300',
    badgeBorder: 'border-yellow-500/35',
    dotClass: 'bg-yellow-400',
  },
  High: {
    hex: '#f97316',
    rgb: [249, 115, 22],
    badgeBg: 'bg-orange-500/15',
    badgeText: 'text-orange-300',
    badgeBorder: 'border-orange-500/35',
    dotClass: 'bg-orange-400',
  },
  Severe: {
    hex: '#ef4444',
    rgb: [239, 68, 68],
    badgeBg: 'bg-red-500/15',
    badgeText: 'text-red-300',
    badgeBorder: 'border-red-500/40',
    dotClass: 'bg-red-500',
  },
  'No Travel': {
    hex: '#ec4899',
    rgb: [236, 72, 153],
    badgeBg: 'bg-pink-500/20',
    badgeText: 'text-pink-200',
    badgeBorder: 'border-pink-500/50',
    dotClass: 'bg-pink-500',
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
      text: 'text-emerald-400',
      ring: 'border-emerald-500/40',
      bg: 'bg-emerald-500/10',
      label: 'Optimal Dispatch',
    };
  }
  if (score >= 65) {
    return {
      text: 'text-yellow-300',
      ring: 'border-yellow-500/40',
      bg: 'bg-yellow-500/10',
      label: 'Moderate Caution',
    };
  }
  if (score >= 45) {
    return {
      text: 'text-orange-400',
      ring: 'border-orange-500/40',
      bg: 'bg-orange-500/10',
      label: 'High Risk Advisory',
    };
  }
  if (score >= 25) {
    return {
      text: 'text-red-400',
      ring: 'border-red-500/40',
      bg: 'bg-red-500/10',
      label: 'Severe Hazard',
    };
  }
  return {
    text: 'text-pink-400',
    ring: 'border-pink-500/50',
    bg: 'bg-pink-500/15',
    label: 'No Travel / Hold Load',
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
