import { LocalNotifications } from '@capacitor/local-notifications'

export async function requestNotificationPermission(): Promise<boolean> {
  const result = await LocalNotifications.requestPermissions()
  return result.display === 'granted'
}

export async function notifyAppUpdated(appName: string, appId: string): Promise<void> {
  await LocalNotifications.schedule({
    notifications: [{
      id: Math.abs(appId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 2147483647,
      title: '📱 App Updated',
      body: `${appName} has a new version ready. Tap to open.`,
      extra: { appId },
    }],
  })
}

export function onNotificationTap(handler: (appId: string) => void) {
  LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const appId = event.notification.extra?.appId
    if (appId) handler(appId)
  })
}
