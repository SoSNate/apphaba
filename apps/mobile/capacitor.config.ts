import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.appaba.mobile',
  appName: 'AppAba',
  webDir: 'dist',
  server: {
    // Uncomment for live-reload during development:
    // url: 'http://YOUR_LAN_IP:5173',
    // cleartext: true,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#6366f1',
      sound: 'beep.wav',
    },
  },
}

export default config
