export default function handler(req, res) {
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(
    `window.GOOGLE_OAUTH_CLIENT_ID = ${JSON.stringify(process.env.GOOGLE_OAUTH_CLIENT_ID || "")};\n` +
    `window.PUBLIC_API_BASE = ${JSON.stringify(process.env.PUBLIC_API_BASE || "")};\n`
  );
}
