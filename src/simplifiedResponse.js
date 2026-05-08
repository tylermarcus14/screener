export function simplifyScreeningResponse(result) {
  const body = result?.body || result || {};
  return {
    zapierAction: body.zapierAction || "hold_for_hr_review",
    urls: extractFlagUrls(body.flags)
  };
}

export function serviceErrorResponse() {
  return {
    zapierAction: "hold_for_hr_review",
    urls: []
  };
}

function extractFlagUrls(flags) {
  if (!Array.isArray(flags)) return [];

  const urls = [];
  const seen = new Set();
  for (const flag of flags) {
    const url = String(flag?.url || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}
