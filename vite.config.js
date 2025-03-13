import { defineConfig } from "vite";
import olovaPlugin from "./vite-plugin-olova-fixed.js";

export default defineConfig({
  plugins: [olovaPlugin()],
});
