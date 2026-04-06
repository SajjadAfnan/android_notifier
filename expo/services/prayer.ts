import AsyncStorage from '@react-native-async-storage/async-storage';

export const PRAYER_API_URL = 'https://api.aladhan.com/v1/timingsByCity?city=Kochi&country=India&method=2';
export const PRAYER_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
export const STORAGE_KEYS = {
  prayerData: 'kochi-prayer-data',
  scheduledIds: 'kochi-prayer-scheduled-ids',
} as const;

export type PrayerName = (typeof PRAYER_NAMES)[number];

export interface PrayerTimings {
  Fajr: string;
  Dhuhr: string;
  Asr: string;
  Maghrib: string;
  Isha: string;
}

export interface StoredPrayerData {
  fetchedAt: number;
  sourceDate: string;
  timings: PrayerTimings;
}

interface AladhanResponse {
  code: number;
  data?: {
    date?: {
      gregorian?: {
        date?: string;
      };
    };
    timings?: Record<string, string | undefined>;
  };
}

export function sanitizePrayerTime(value: string | undefined): string {
  const cleanedValue = value?.split(' ')[0]?.trim() ?? '';
  const match = cleanedValue.match(/^(\d{1,2}):(\d{2})/);

  if (!match) {
    throw new Error(`Invalid prayer time received: ${value ?? 'unknown'}`);
  }

  const hours = match[1].padStart(2, '0');
  const minutes = match[2];
  return `${hours}:${minutes}`;
}

export function getDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isPrayerDataStale(data: StoredPrayerData | null, now: Date = new Date()): boolean {
  if (!data) {
    return true;
  }

  const ageMs = now.getTime() - data.fetchedAt;
  return ageMs >= 24 * 60 * 60 * 1000 || data.sourceDate !== getDateKey(now);
}

export async function getStoredPrayerData(): Promise<StoredPrayerData | null> {
  try {
    const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.prayerData);
    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as StoredPrayerData;
    return parsedValue;
  } catch (error) {
    console.log('Failed to read stored prayer data', error);
    return null;
  }
}

export async function savePrayerData(data: StoredPrayerData): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.prayerData, JSON.stringify(data));
}

export async function fetchPrayerData(): Promise<StoredPrayerData> {
  console.log('Fetching Kochi prayer times from Aladhan API');

  const response = await fetch(PRAYER_API_URL);
  if (!response.ok) {
    throw new Error(`Prayer API request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as AladhanResponse;
  const timings = payload.data?.timings;
  const sourceDate = payload.data?.date?.gregorian?.date;

  if (!timings || !sourceDate) {
    throw new Error('Prayer API response was missing required data');
  }

  const parsedData: StoredPrayerData = {
    fetchedAt: Date.now(),
    sourceDate: getDateKey(new Date(sourceDate.split('-').reverse().join('-'))),
    timings: {
      Fajr: sanitizePrayerTime(timings.Fajr),
      Dhuhr: sanitizePrayerTime(timings.Dhuhr),
      Asr: sanitizePrayerTime(timings.Asr),
      Maghrib: sanitizePrayerTime(timings.Maghrib),
      Isha: sanitizePrayerTime(timings.Isha),
    },
  };

  await savePrayerData(parsedData);
  console.log('Prayer times stored locally', parsedData);
  return parsedData;
}

export async function getOrRefreshPrayerData(forceRefresh: boolean = false): Promise<StoredPrayerData> {
  const storedData = await getStoredPrayerData();
  if (!forceRefresh && storedData && !isPrayerDataStale(storedData)) {
    console.log('Using cached prayer times');
    return storedData;
  }

  return fetchPrayerData();
}

export function buildPrayerDate(time: string, referenceDate: Date = new Date()): Date {
  const [hoursText, minutesText] = time.split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const prayerDate = new Date(referenceDate);
  prayerDate.setHours(hours, minutes, 0, 0);
  return prayerDate;
}

export function formatPrayerTime12Hour(time: string): string {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return time;
  }

  const parsedHours = Number(match[1]);
  const minutes = match[2];
  const suffix = parsedHours >= 12 ? 'PM' : 'AM';
  const normalizedHours = parsedHours % 12 || 12;
  return `${normalizedHours}:${minutes} ${suffix}`;
}

export function getNextPrayer(data: StoredPrayerData | null, now: Date = new Date()): { name: PrayerName; time: string } | null {
  if (!data) {
    return null;
  }

  for (const prayerName of PRAYER_NAMES) {
    const prayerDate = buildPrayerDate(data.timings[prayerName], now);
    if (prayerDate.getTime() >= now.getTime()) {
      return { name: prayerName, time: data.timings[prayerName] };
    }
  }

  return { name: 'Fajr', time: data.timings.Fajr };
}
