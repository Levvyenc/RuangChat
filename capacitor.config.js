const { defineConfig } = require('@capacitor/cli');
module.exports = defineConfig({
  appId: 'id.ruangchat.app',
  appName: 'RuangChat',
  webDir: 'client/dist',
  bundledWebRuntime: false
});
