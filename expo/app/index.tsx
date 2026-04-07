import { useMutation, useQuery } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  formatPrayerTime12Hour,
  getNextPrayer,
  getOrRefreshPrayerData,
  PRAYER_NAMES,
  type StoredPrayerData,
} from '@/services/prayer';
import {
  scheduleCustomTestNotificationAsync,
  schedulePrayerNotifications,
  scheduleTestNotificationAfterOneMinuteAsync,
  sendTestNotificationNowAsync,
  setupPrayerNotifierAsync,
} from '@/services/prayerBackground';

interface SetupResult {
  prayerData: StoredPrayerData | null;
  permissionGranted: boolean;
}

type Period = 'AM' | 'PM';

function formatLastUpdated(timestamp: number | null): string {
  if (!timestamp) {
    return 'Waiting for first sync';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    day: 'numeric',
    month: 'short',
  }).format(new Date(timestamp));
}

function sanitizeNumberInput(value: string, maxLength: number): string {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

export default function HomeScreen() {
  const [now, setNow] = useState<Date>(new Date());
  const [customHour, setCustomHour] = useState<string>('10');
  const [customMinute, setCustomMinute] = useState<string>('00');
  const [customPeriod, setCustomPeriod] = useState<Period>('AM');

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

  const sendNowMutation = useMutation<string | null>({
    mutationFn: () => sendTestNotificationNowAsync(),
  });

  const scheduleOneMinuteMutation = useMutation<string | null>({
    mutationFn: () => scheduleTestNotificationAfterOneMinuteAsync(),
  });

  const scheduleCustomMutation = useMutation<string | null, Error, { hour: string; minute: string; period: Period }>({
    mutationFn: ({ hour, minute, period }) => scheduleCustomTestNotificationAsync(hour, minute, period),
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
  const permissionGranted = setupQuery.data?.permissionGranted ?? false;
  const refreshError = refreshMutation.error instanceof Error ? refreshMutation.error.message : null;
  const setupError = setupQuery.error instanceof Error ? setupQuery.error.message : null;
  const customError = scheduleCustomMutation.error instanceof Error ? scheduleCustomMutation.error.message : null;
  const activeError = refreshError ?? setupError ?? customError;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']} testID="home-screen">
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshMutation.isPending} onRefresh={() => refreshMutation.mutate()} />}
        testID="prayer-scroll-view"
      >
        <Text style={styles.title}>Prayer Notifier Running</Text>
        <Text style={styles.text}>Kochi, India</Text>
        <Text style={styles.text}>Current time: {formatLastUpdated(now.getTime())}</Text>
        <Text style={styles.text}>Notifications: {Platform.OS === 'web' ? 'Preview only' : permissionGranted ? 'Enabled' : 'Permission needed'}</Text>
        <Text style={styles.text}>Last sync: {formatLastUpdated(prayerData?.fetchedAt ?? null)}</Text>
        <Text style={styles.text} testID="next-prayer-text">
          Next prayer: {nextPrayer ? `${nextPrayer.name} - ${formatPrayerTime12Hour(nextPrayer.time)}` : 'Loading'}
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={() => refreshMutation.mutate()}
          style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
          testID="refresh-button"
        >
          {refreshMutation.isPending ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.buttonText}>Refresh prayer times</Text>}
        </Pressable>

        <Text style={styles.sectionTitle}>Test notifications</Text>

        <Pressable
          accessibilityRole="button"
          disabled={sendNowMutation.isPending || Platform.OS === 'web'}
          onPress={() => sendNowMutation.mutate()}
          style={({ pressed }) => [styles.button, styles.secondaryButton, (pressed || sendNowMutation.isPending || Platform.OS === 'web') ? styles.buttonPressed : null]}
          testID="send-now-button"
        >
          <Text style={styles.buttonText}>{sendNowMutation.isPending ? 'Sending...' : 'Send now'}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={scheduleOneMinuteMutation.isPending || Platform.OS === 'web'}
          onPress={() => scheduleOneMinuteMutation.mutate()}
          style={({ pressed }) => [styles.button, styles.secondaryButton, (pressed || scheduleOneMinuteMutation.isPending || Platform.OS === 'web') ? styles.buttonPressed : null]}
          testID="schedule-one-minute-button"
        >
          <Text style={styles.buttonText}>{scheduleOneMinuteMutation.isPending ? 'Scheduling...' : 'Schedule after 1 min'}</Text>
        </Pressable>

        <View style={styles.customSection} testID="custom-time-section">
          <Text style={styles.sectionTitle}>Schedule custom test time</Text>
          <View style={styles.timeRow}>
            <TextInput
              keyboardType="number-pad"
              onChangeText={(value) => setCustomHour(sanitizeNumberInput(value, 2))}
              placeholder="HH"
              placeholderTextColor="#666666"
              style={styles.input}
              testID="custom-hour-input"
              value={customHour}
            />
            <Text style={styles.colon}>:</Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={(value) => setCustomMinute(sanitizeNumberInput(value, 2))}
              placeholder="MM"
              placeholderTextColor="#666666"
              style={styles.input}
              testID="custom-minute-input"
              value={customMinute}
            />
            <View style={styles.periodRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setCustomPeriod('AM')}
                style={({ pressed }) => [styles.periodButton, customPeriod === 'AM' ? styles.periodButtonActive : null, pressed ? styles.buttonPressed : null]}
                testID="custom-period-am"
              >
                <Text style={[styles.periodText, customPeriod === 'AM' ? styles.periodTextActive : null]}>AM</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setCustomPeriod('PM')}
                style={({ pressed }) => [styles.periodButton, customPeriod === 'PM' ? styles.periodButtonActive : null, pressed ? styles.buttonPressed : null]}
                testID="custom-period-pm"
              >
                <Text style={[styles.periodText, customPeriod === 'PM' ? styles.periodTextActive : null]}>PM</Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            disabled={scheduleCustomMutation.isPending || Platform.OS === 'web'}
            onPress={() => scheduleCustomMutation.mutate({ hour: customHour, minute: customMinute, period: customPeriod })}
            style={({ pressed }) => [styles.button, styles.secondaryButton, (pressed || scheduleCustomMutation.isPending || Platform.OS === 'web') ? styles.buttonPressed : null]}
            testID="schedule-custom-button"
          >
            <Text style={styles.buttonText}>{scheduleCustomMutation.isPending ? 'Scheduling...' : 'Schedule custom time'}</Text>
          </Pressable>
        </View>

        <View style={styles.list} testID="prayer-times-card">
          {PRAYER_NAMES.map((prayerName) => {
            const prayerTime = prayerData?.timings[prayerName] ? formatPrayerTime12Hour(prayerData.timings[prayerName]) : '--:--';
            return (
              <View key={prayerName} style={styles.row} testID={`prayer-row-${prayerName}`}>
                <Text style={styles.rowLabel}>{prayerName}</Text>
                <Text style={styles.rowValue}>{prayerTime}</Text>
              </View>
            );
          })}
        </View>

        {activeError ? (
          <Text style={styles.errorText} testID="error-card">
            {activeError}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111111',
  },
  text: {
    fontSize: 16,
    color: '#222222',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111111',
    marginTop: 8,
  },
  button: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#111111',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButton: {
    backgroundColor: '#333333',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  customSection: {
    gap: 12,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    width: 64,
    height: 48,
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 18,
    color: '#111111',
  },
  colon: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111111',
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  periodButton: {
    height: 48,
    minWidth: 56,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cccccc',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  periodButtonActive: {
    backgroundColor: '#111111',
    borderColor: '#111111',
  },
  periodText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '600',
  },
  periodTextActive: {
    color: '#ffffff',
  },
  list: {
    borderWidth: 1,
    borderColor: '#dddddd',
    borderRadius: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eeeeee',
  },
  rowLabel: {
    fontSize: 16,
    color: '#111111',
  },
  rowValue: {
    fontSize: 16,
    color: '#111111',
    fontWeight: '600',
  },
  errorText: {
    color: '#b00020',
    fontSize: 14,
  },
});
