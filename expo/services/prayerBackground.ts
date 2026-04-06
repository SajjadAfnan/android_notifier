import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import {
  buildPrayerDate,
  getDateKey,
  getOrRefreshPrayerData,
  PRAYER_NAMES,
  STORAGE_KEYS,
  type PrayerName,
  type StoredPrayerData,
} from '@/services/prayer';

export const PRAYER_SYNC_TASK = 'kochi-prayer-sync-task';
const ANDROID_CHANNEL_ID = 'prayer-alerts';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

TaskManager.defineTask(PRAYER_SYNC_TASK, async () => {
  console.log('Background prayer sync triggered');

  try {
    const prayerData = await getOrRefreshPrayerData(false);
    await schedulePrayerNotifications(prayerData);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.log('Background prayer sync failed', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function setupPrayerNotifierAsync(): Promise<{ prayerData: StoredPrayerData | null; permissionGranted: boolean }> {
  const permissionGranted = await requestNotificationPermissionAsync();

  try {
    const prayerData = await getOrRefreshPrayerData(false);
    if (permissionGranted) {
      await ensureAndroidChannelAsync();
      await schedulePrayerNotifications(prayerData);
      await registerPrayerBackgroundTaskAsync();
    }
    return { prayerData, permissionGranted };
  } catch (error) {
    console.log('Initial prayer notifier setup failed', error);
    await registerPrayerBackgroundTaskAsync();
    return { prayerData: null, permissionGranted };
  }
}

export async function requestNotificationPermissionAsync(): Promise<boolean> {
  if (Platform.OS === 'web') {
    console.log('Skipping notification permission request on web');
    return false;
  }

  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) {
    return true;
  }

  const updatedSettings = await Notifications.requestPermissionsAsync();
  return updatedSettings.granted;
}

async function ensureAndroidChannelAsync(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Prayer Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    sound: null,
    vibrationPattern: [0],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function registerPrayerBackgroundTaskAsync(): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('Background task registration skipped on web');
    return;
  }

  const isTaskManagerAvailable = await TaskManager.isAvailableAsync();
  if (!isTaskManagerAvailable) {
    console.log('TaskManager is not available in this environment');
    return;
  }

  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) {
    console.log('BackgroundTask is not available', status);
    return;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(PRAYER_SYNC_TASK);
  if (isRegistered) {
    console.log('Background prayer task already registered');
    return;
  }

  await BackgroundTask.registerTaskAsync(PRAYER_SYNC_TASK, {
    minimumInterval: 60,
  });
  console.log('Background prayer task registered');
}

export async function schedulePrayerNotifications(data: StoredPrayerData): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }

  await ensureAndroidChannelAsync();

  const previouslyScheduledIdsRaw = await AsyncStorage.getItem(STORAGE_KEYS.scheduledIds);
  const previouslyScheduledIds = previouslyScheduledIdsRaw ? (JSON.parse(previouslyScheduledIdsRaw) as string[]) : [];

  await Promise.all(
    previouslyScheduledIds.map(async (notificationId) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
      } catch (error) {
        console.log('Failed to cancel old notification', notificationId, error);
      }
    })
  );

  const now = new Date();
  const todayKey = getDateKey(now);
  const scheduledIds: string[] = [];

  for (const prayerName of PRAYER_NAMES) {
    const triggerDate = buildPrayerDate(data.timings[prayerName], now);
    if (triggerDate.getTime() < now.getTime()) {
      continue;
    }

    const notificationId = await scheduleSinglePrayerNotification(prayerName, triggerDate, todayKey);
    scheduledIds.push(notificationId);
  }

  await AsyncStorage.setItem(STORAGE_KEYS.scheduledIds, JSON.stringify(scheduledIds));
  console.log('Scheduled prayer notifications', scheduledIds);
}

export async function sendTestNotificationNowAsync(): Promise<string | null> {
  if (Platform.OS === 'web') {
    console.log('Immediate test notification skipped on web');
    return null;
  }

  await ensureAndroidChannelAsync();
  console.log('Sending immediate test notification');

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Prayer Time',
      body: 'Test Notification',
      sound: false,
      priority: Notifications.AndroidNotificationPriority.HIGH,
      data: {
        prayerName: 'Test',
        triggerTime: new Date().toISOString(),
      },
    },
    trigger: null,
  });
}

export async function scheduleTestNotificationAfterOneMinuteAsync(): Promise<string | null> {
  if (Platform.OS === 'web') {
    console.log('Delayed test notification skipped on web');
    return null;
  }

  await ensureAndroidChannelAsync();

  const triggerDate = new Date(Date.now() + 60 * 1000);
  console.log('Scheduling test notification for', triggerDate.toISOString());

  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Prayer Time',
      body: 'Test Notification',
      sound: false,
      priority: Notifications.AndroidNotificationPriority.HIGH,
      data: {
        prayerName: 'Test',
        triggerTime: triggerDate.toISOString(),
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      channelId: Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined,
      date: triggerDate,
    },
  });
}

async function scheduleSinglePrayerNotification(prayerName: PrayerName, triggerDate: Date, dateKey: string): Promise<string> {
  const identifier = `${dateKey}-${prayerName}`;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);

  return Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: 'Prayer Time',
      body: `${prayerName} Time`,
      sound: false,
      priority: Notifications.AndroidNotificationPriority.HIGH,
      data: {
        prayerName,
        triggerTime: triggerDate.toISOString(),
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      channelId: Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined,
      date: triggerDate,
    },
  });
}
