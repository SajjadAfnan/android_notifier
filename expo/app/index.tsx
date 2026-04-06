import { useMutation, useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Clock3, CloudMoon, RefreshCw } from 'lucide-react-native';

import {
  getNextPrayer,
  getOrRefreshPrayerData,
  PRAYER_NAMES,
  type StoredPrayerData,
} from '@/services/prayer';
import { schedulePrayerNotifications, setupPrayerNotifierAsync } from '@/services/prayerBackground';

interface SetupResult {
  prayerData: StoredPrayerData | null;
  permissionGranted: boolean;
}

function formatLastUpdated(timestamp: number | null): string {
  if (!timestamp) {
    return 'Waiting for first sync';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  }).format(new Date(timestamp));
}

function getClockLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export default function HomeScreen() {
  const [now, setNow] = useState<Date>(new Date());

  const setupQuery = useQuery<SetupResult>({
    queryKey: ['kochi-prayer-notifier'],
    queryFn: () => setupPrayerNotifierAsync(),
    refetchOnWindowFocus: false,
  });

  const refreshMutation = useMutation<StoredPrayerData>({
    mutationFn: async () => {
      const prayerData = await getOrRefreshPrayerData(true);
      if (Platform.OS !== 'web') {
        await schedulePrayerNotifications(prayerData);
      }
      return prayerData;
    },
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60 * 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const prayerData = refreshMutation.data ?? setupQuery.data?.prayerData ?? null;
  const nextPrayer = useMemo(() => getNextPrayer(prayerData, now), [prayerData, now]);
  const isBusy = setupQuery.isLoading || refreshMutation.isPending;
  const permissionGranted = setupQuery.data?.permissionGranted ?? false;
  const refreshError = refreshMutation.error instanceof Error ? refreshMutation.error.message : null;
  const setupError = setupQuery.error instanceof Error ? setupQuery.error.message : null;
  const activeError = refreshError ?? setupError;

  return (
    <View style={styles.screen} testID="home-screen">
      <LinearGradient
        colors={['#03111B', '#0B2233', '#123B48']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glowTop} pointerEvents="none" />
      <View style={styles.glowBottom} pointerEvents="none" />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <ScrollView
          testID="prayer-scroll-view"
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshMutation.isPending} onRefresh={() => refreshMutation.mutate()} />}
        >
          <View style={styles.heroCard} testID="hero-card">
            <View style={styles.heroBadge}>
              <Bell color="#7DD3FC" size={16} />
              <Text style={styles.heroBadgeText}>Kochi, India</Text>
            </View>

            <Text style={styles.title}>Prayer Notifier Running</Text>
            <Text style={styles.subtitle}>
              Fetches prayer times once per day, stores them locally, and schedules silent alerts for Fajr, Dhuhr, Asr, Maghrib, and Isha.
            </Text>

            <View style={styles.heroFooter}>
              <View style={styles.heroMeta}>
                <Clock3 color="#CFFAFE" size={16} />
                <Text style={styles.heroMetaText}>{getClockLabel(now)}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => refreshMutation.mutate()}
                style={({ pressed }) => [styles.refreshButton, pressed ? styles.refreshButtonPressed : null]}
                testID="refresh-button"
              >
                {refreshMutation.isPending ? <ActivityIndicator color="#03111B" size="small" /> : <RefreshCw color="#03111B" size={16} />}
                <Text style={styles.refreshButtonText}>Refresh</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.statusRow}>
            <View style={styles.statusCard} testID="sync-status-card">
              <Text style={styles.statusLabel}>Last sync</Text>
              <Text style={styles.statusValue}>{formatLastUpdated(prayerData?.fetchedAt ?? null)}</Text>
            </View>
            <View style={styles.statusCard} testID="notifications-status-card">
              <Text style={styles.statusLabel}>Notifications</Text>
              <Text style={styles.statusValue}>
                {Platform.OS === 'web' ? 'Preview only' : permissionGranted ? 'Enabled' : 'Permission needed'}
              </Text>
            </View>
          </View>

          <View style={styles.nextPrayerCard} testID="next-prayer-card">
            <View style={styles.nextPrayerHeader}>
              <CloudMoon color="#86EFAC" size={18} />
              <Text style={styles.nextPrayerLabel}>Next prayer</Text>
            </View>
            <Text style={styles.nextPrayerName}>{nextPrayer?.name ?? 'Loading'}</Text>
            <Text style={styles.nextPrayerTime}>{nextPrayer?.time ?? '--:--'}</Text>
          </View>

          <View style={styles.listCard} testID="prayer-times-card">
            <Text style={styles.listTitle}>Today&apos;s stored prayer times</Text>
            {PRAYER_NAMES.map((prayerName) => {
              const prayerTime = prayerData?.timings[prayerName] ?? '--:--';
              const isNextPrayer = nextPrayer?.name === prayerName;

              return (
                <View key={prayerName} style={[styles.prayerRow, isNextPrayer ? styles.prayerRowActive : null]} testID={`prayer-row-${prayerName}`}>
                  <Text style={[styles.prayerName, isNextPrayer ? styles.prayerNameActive : null]}>{prayerName}</Text>
                  <Text style={[styles.prayerTime, isNextPrayer ? styles.prayerTimeActive : null]}>{prayerTime}</Text>
                </View>
              );
            })}
          </View>

          {activeError ? (
            <View style={styles.errorCard} testID="error-card">
              <Text style={styles.errorTitle}>Could not refresh prayer times</Text>
              <Text style={styles.errorText}>{activeError}</Text>
              <Text style={styles.errorText}>The app will keep using cached times and retry on the next cycle.</Text>
            </View>
          ) : null}

          <Text style={styles.footnote} testID="footnote-text">
            {isBusy
              ? 'Preparing notifier…'
              : Platform.OS === 'web'
                ? 'Web preview shows cached prayer times. Exact local notifications run on Android devices.'
                : 'Alerts are scheduled locally on your device after the daily sync.'}
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#03111B',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    gap: 16,
  },
  glowTop: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 220,
    backgroundColor: 'rgba(34, 211, 238, 0.16)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -120,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: 'rgba(74, 222, 128, 0.14)',
  },
  heroCard: {
    borderRadius: 28,
    padding: 22,
    backgroundColor: 'rgba(8, 28, 40, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.16)',
    gap: 14,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(14, 116, 144, 0.28)',
  },
  heroBadgeText: {
    color: '#CFFAFE',
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    color: '#F8FAFC',
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '800',
  },
  subtitle: {
    color: '#B6CBD8',
    fontSize: 15,
    lineHeight: 23,
  },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroMetaText: {
    color: '#E0F2FE',
    fontSize: 15,
    fontWeight: '600',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: '#86EFAC',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 116,
  },
  refreshButtonPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  refreshButtonText: {
    color: '#03111B',
    fontSize: 14,
    fontWeight: '800',
  },
  statusRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statusCard: {
    flex: 1,
    borderRadius: 22,
    padding: 18,
    backgroundColor: 'rgba(7, 24, 34, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.14)',
    gap: 8,
  },
  statusLabel: {
    color: '#7DD3FC',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  statusValue: {
    color: '#F8FAFC',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
  },
  nextPrayerCard: {
    borderRadius: 28,
    padding: 22,
    backgroundColor: '#DCFCE7',
    gap: 10,
  },
  nextPrayerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nextPrayerLabel: {
    color: '#14532D',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  nextPrayerName: {
    color: '#052E16',
    fontSize: 30,
    fontWeight: '800',
  },
  nextPrayerTime: {
    color: '#166534',
    fontSize: 18,
    fontWeight: '700',
  },
  listCard: {
    borderRadius: 28,
    padding: 18,
    backgroundColor: 'rgba(7, 24, 34, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.14)',
    gap: 6,
  },
  listTitle: {
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  prayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  prayerRowActive: {
    backgroundColor: 'rgba(125, 211, 252, 0.12)',
  },
  prayerName: {
    color: '#D6E4EC',
    fontSize: 16,
    fontWeight: '600',
  },
  prayerNameActive: {
    color: '#F8FAFC',
  },
  prayerTime: {
    color: '#7DD3FC',
    fontSize: 16,
    fontWeight: '700',
  },
  prayerTimeActive: {
    color: '#86EFAC',
  },
  errorCard: {
    borderRadius: 22,
    padding: 18,
    backgroundColor: 'rgba(69, 10, 10, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.34)',
    gap: 8,
  },
  errorTitle: {
    color: '#FECACA',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#FEE2E2',
    fontSize: 14,
    lineHeight: 21,
  },
  footnote: {
    color: '#9FB4C0',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
});

