// Public Supabase helper (anon key only). Avoids sending empty/undefined Authorization headers.
let cachedEnv = null;

function isFormData(body) {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

const isPublishable = (key) => /^sb_publishable_[A-Za-z0-9_-]+/.test(key);
const isLegacyJwt = (key) => /^eyJ[^.]*\.[^.]+\.[^.]+/.test(key);
const isForbidden = (key) => !key || key === "<REPLACE_WITH_SUPABASE_ANON_KEY>" || key === "sb_publishable_XXXX";

export function validateEnv(envInput) {
  const env = envInput || (typeof window !== "undefined" ? window.__ENV__ : globalThis.__ENV__);
  const url = ((env && env.SUPABASE_URL) || "").trim();
  const anonKey = ((env && env.SUPABASE_ANON_KEY) || "").trim();

  if (!url) {
    throw new Error("Missing SUPABASE_URL. Ensure /js/config.js is loaded before modules.");
  }

  if (isForbidden(anonKey)) {
    throw new Error("Missing SUPABASE_ANON_KEY. Ensure /js/config.js is loaded before modules.");
  }

  if (anonKey.startsWith("sb_secret_")) {
    throw new Error("Never expose sb_secret_ in the browser (backend only).");
  }

  if (!(isPublishable(anonKey) || isLegacyJwt(anonKey))) {
    throw new Error("SUPABASE_ANON_KEY must be publishable (sb_publishable_...) or legacy anon JWT (eyJ... with 3 parts).");
  }

  return { url, anonKey };
}

export function getEnv() {
  if (cachedEnv) return cachedEnv;
  cachedEnv = validateEnv();
  return cachedEnv;
}

// Helper to call Supabase REST with proper headers and structured error reporting.
export async function supabaseFetch(pathWithQuery, options = {}) {
  const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = getEnv();
  const { headers = {}, ...rest } = options;
  const url = pathWithQuery.startsWith("http") ? pathWithQuery : `${SUPABASE_URL}${pathWithQuery}`;

  const baseHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
  };

  if (isLegacyJwt(SUPABASE_ANON_KEY)) {
    baseHeaders.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }

  const hasBody = rest.body !== undefined;
  const shouldJsonify = hasBody && !isFormData(rest.body) && typeof rest.body === "object";
  if (shouldJsonify) {
    rest.body = JSON.stringify(rest.body);
  }

  const response = await fetch(url, {
    ...rest,
    headers: {
      ...baseHeaders,
      ...headers,
    },
  });

  if (!response.ok) {
    try {
      const clone = response.clone();
      const bodyText = await clone.text();
      console.error("[SUPABASE] HTTP error", {
        status: response.status,
        path: url,
        body: bodyText || "<empty>",
      });
    } catch (_) {
      console.error("[SUPABASE] HTTP error", { status: response.status, path: url, body: "<unreadable>" });
    }
  }

  return response;
}
