import { defineConfig, loadEnv } from "vite";

const num = (v: string | undefined, fallback: number): number => {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// base "./" la BAT BUOC: Playables phuc vu game tu duong dan tuong doi.
// De "/" thi asset se tro ve root cua domain YouTube va bi 404.
export default defineConfig(({ mode }) => {
  // loadEnv doc ca .env lan bien moi truong that (prefix "" = lay het).
  const env = loadEnv(mode, ".", "");

  return {
    base: "./",
    server: {
      host: true,
      port: num(env.DEV_PORT, 3000),
      // KHONG duoc them header tuy chinh (X-Frame-Options / CSP).
      // Test Suite nhung game vao iframe phia client -> moi header chan frame
      // deu lam trang test bi trang tinh.
    },
    preview: {
      host: true,
      port: num(env.PREVIEW_PORT, 4173),
    },
    build: {
      target: "es2020",
      outDir: "dist",
      assetsDir: "assets",
      // Ten file chi duoc chua [A-Za-z0-9._-/] (Test Suite MUST).
      // Vite mac dinh sinh hash an toan — dung doi o day.
      assetsInlineLimit: 4096,
      cssCodeSplit: false,
      reportCompressedSize: true,
      sourcemap: false,
    },
  };
});
