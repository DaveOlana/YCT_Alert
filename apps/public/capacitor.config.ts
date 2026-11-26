import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yctalert.app',
  appName: 'YCT Alert',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
};

export default config;
