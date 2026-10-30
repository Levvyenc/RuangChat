const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react");
module.exports = defineConfig({
  root: __dirname,
  base: "./",
  plugins: [react()],
  server: { host: "0.0.0.0", port: 5173, proxy: { "/api": "http://127.0.0.1:2162", "/ws": { target: "ws://127.0.0.1:2162", ws: true } } },
  build: { outDir: "dist", emptyOutDir: true }
});
