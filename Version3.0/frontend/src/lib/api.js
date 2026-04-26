const RAW_BASE = (import.meta.env.VITE_API_URL || "").trim();
const API_BASE = RAW_BASE.replace(/\/+$/, "");

export function apiUrl(path) {
  if (!path) return API_BASE || "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function request(method, path, body) {
  const opts = {
    method,
    credentials: "include",
    headers: { "Accept": "application/json" },
  };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(apiUrl(path), opts);
  let data = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) data = await res.json();
  else data = { text: await res.text() };
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function uploadFiles(path, files, fieldName = "files", extraFields = null) {
  const fd = new FormData();
  for (const f of files) fd.append(fieldName, f);
  if (extraFields && typeof extraFields === "object") {
    for (const [k, v] of Object.entries(extraFields)) {
      if (v !== undefined && v !== null) fd.append(k, typeof v === "string" ? v : String(v));
    }
  }
  const res = await fetch(apiUrl(path), { method: "POST", credentials: "include", body: fd });
  let data = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) data = await res.json();
  else data = { text: await res.text() };
  if (!res.ok) {
    const err = new Error(data?.error || `Upload failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get:    (p)    => request("GET", p),
  post:   (p, b) => request("POST", p, b ?? {}),
  patch:  (p, b) => request("PATCH", p, b ?? {}),
  del:    (p)    => request("DELETE", p),
  upload: (p, files, field, extra) => uploadFiles(p, files, field, extra),
};
