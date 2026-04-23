import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.linkup.app',
  appName: 'LinkUp',
  webDir: 'dist',
  // Uncomment below for live-reload during dev (replace with your PC's local IP):
  // server: {
  //   url: 'http://192.168.1.XXX:5173',
  //   cleartext: true,
  // },
  android: {
    allowMixedContent: true,   // allow HTTP + HTTPS resources
  },
  plugins: {},
};

export default config;
