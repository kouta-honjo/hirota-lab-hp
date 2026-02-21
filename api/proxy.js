export const config = {
  api: {
    bodyParser: false,
  },
};

function isAllowedBase(base) {
  try {
    const u = new URL(base);
    const host = u.hostname.toLowerCase();
    return (
      u.protocol === "https:" &&
      (host.endsWith(".run.app") || host.endsWith(".a.run.app"))
    );
  } catch {
    return false;
  }
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  const { path } = req.query;
  const base = req.query.base || process.env.PUBLIC_API_BASE || "";

  if (!path || typeof path !== "string") {
    res.status(400).send("Missing path");
    return;
  }
  if (!base) {
    res.status(400).send("Missing base URL – set PUBLIC_API_BASE env var");
    return;
  }
  if (!isAllowedBase(base)) {
    res.status(400).send("Invalid base URL");
    return;
  }

  let target;
  try {
    const baseUrl = new URL(base.endsWith("/") ? base : `${base}/`);
    const relativePath = path.startsWith("/") ? path.slice(1) : path;
    target = new URL(relativePath, baseUrl).toString();
  } catch {
    res.status(400).send("Invalid target URL");
    return;
  }

  try {
    const headers = {};
    if (req.headers["content-type"]) {
      headers["content-type"] = req.headers["content-type"];
    }
    if (req.headers["accept"]) {
      headers["accept"] = req.headers["accept"];
    }
    if (req.headers["authorization"]) {
      headers["authorization"] = req.headers["authorization"];
    }

    const init = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = await readRawBody(req);
    }

    const upstream = await fetch(target, init);
    const buffer = Buffer.from(await upstream.arrayBuffer());

    const contentType = upstream.headers.get("content-type");
    const contentDisposition = upstream.headers.get("content-disposition");
    if (contentType) res.setHeader("content-type", contentType);
    if (contentDisposition) res.setHeader("content-disposition", contentDisposition);

    res.status(upstream.status).send(buffer);
  } catch (e) {
    res.status(502).send(`Proxy error: ${e.message}`);
  }
}
