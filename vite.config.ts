import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (id.includes("socket.io-client")) {
            return "vendor-socket";
          }
          if (id.includes("framer-motion")) {
            return "vendor-motion";
          }
          if (id.includes("react-dom") || id.includes("/react/")) {
            return "vendor-react";
          }
          if (id.includes("@react-three/drei")) {
            if (
              id.includes("/Stars") ||
              id.includes("/Sparkles") ||
              id.includes("/Line")
            ) {
              return "vendor-drei-vfx";
            }
            return "vendor-drei-core";
          }
          if (id.includes("@react-three/fiber") || id.includes("/three/")) {
            return "vendor-three-core";
          }
          return undefined;
        }
      }
    }
  },
  server: {
    port: 5173
  }
});
