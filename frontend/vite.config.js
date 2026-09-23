import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        ...["Workers", "Assets", "Widgets", "ThirdParty"].map((name) => ({
          src: `node_modules/cesium/Build/Cesium/${name}`,
          dest: "cesium",
          rename: { stripBase: 4 },
        })),
        {
          src: "node_modules/@mediapipe/tasks-vision/wasm/*",
          dest: "mediapipe",
          rename: { stripBase: true },
        },
      ],
    }),
  ],
  define: { CESIUM_BASE_URL: JSON.stringify("/cesium/") },
  build: { chunkSizeWarningLimit: 1500 },
});
