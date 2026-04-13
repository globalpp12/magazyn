import config from "../config";

export function getImageUrl(pathOrUrl) {
  if (!pathOrUrl) return "";

  if (
    pathOrUrl.startsWith("http://") ||
    pathOrUrl.startsWith("https://")
  ) {
    return pathOrUrl;
  }

  const base = config.r2PublicBaseUrl?.replace(/\/+$/, "") || "";
  const path = String(pathOrUrl).replace(/^\/+/, "");

  if (!base) return path;

  return `${base}/${path}`;
}