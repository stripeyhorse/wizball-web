import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset URLs so the build works from a subdirectory as well as a
  // domain root. The game's own runtime loads already use relative paths
  // ('assets/...'), so without this the bundle and the assets disagree.
  base: './',
  server: {
    host: true,
    port: 5173,
    // Allow tunnelled hosts (ngrok) to reach the dev server.
    allowedHosts: true
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  }
})
