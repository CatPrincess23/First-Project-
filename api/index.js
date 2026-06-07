// Vercel serverless wrapper for the WriteAI Express API
let appPromise = null;

async function getApp() {
  if (!appPromise) {
    const mod = await import(
      /* webpackIgnore: true */
      "./Writer-Assistant/artifacts/api-server/dist-vercel/vercel.mjs"
    );
    appPromise = mod.default;
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
