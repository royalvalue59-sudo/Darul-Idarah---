export const DAILY_DAY_OPTION = 'ডেইলি (প্রতিদিন)' as const;

export const WEEKDAYS = [
  'শনিবার',
  'রবিবার',
  'সোমবার',
  'মঙ্গলবার',
  'বুধবার',
  'বৃহস্পতিবার',
  'শুক্রবার',
] as const;

export const ROUTINE_DAY_OPTIONS = [DAILY_DAY_OPTION, ...WEEKDAYS] as const;

export function isDailySchedule(item: { day_of_week?: string | null; is_daily?: number | boolean | null } | null | undefined): boolean {
  if (!item) return false;
  if (item.is_daily === 1 || item.is_daily === true) return true;
  const s = String(item.day_of_week || '').trim().toLowerCase();
  return s === 'daily' || s === 'everyday' || s === 'ডেইলি' || s === 'প্রতিদিন' || s === DAILY_DAY_OPTION.toLowerCase();
}

export function matchesDayFilter(
  item: { day_of_week?: string | null; is_daily?: number | boolean | null },
  selectedDay: string
): boolean {
  if (!selectedDay || selectedDay === 'all') return true;
  if (selectedDay === DAILY_DAY_OPTION) return isDailySchedule(item);
  return isDailySchedule(item) || item.day_of_week === selectedDay;
}

export function expandWeeklySchedules<
  T extends { day_of_week?: string | null; is_daily?: number | boolean | null; start_time?: string; period_number?: number }
>(items: T[]): Array<{ day: string; items: T[] }> {
  return WEEKDAYS.map((day) => {
    const dayItems = items
      .filter((item) => isDailySchedule(item) || item.day_of_week === day)
      .sort((a, b) => {
        const tCmp = String(a.start_time || '').localeCompare(String(b.start_time || ''));
        if (tCmp !== 0) return tCmp;
        return Number(a.period_number || 0) - Number(b.period_number || 0);
      });
    return { day, items: dayItems };
  });
}

export function formatDayLabel(item: { day_of_week?: string | null; is_daily?: number | boolean | null }): string {
  return isDailySchedule(item) ? DAILY_DAY_OPTION : String(item.day_of_week || '');
}
