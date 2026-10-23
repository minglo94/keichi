const fileId = /^[A-Za-z0-9_-]{10,200}$/;
/** Accept a private Google file link; the reader always uses fixed Google API endpoints. */
export function sourceFileId(value: string): string | null {
  const input = value.trim();
  if (fileId.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    let id: string | null = null;
    if (url.hostname === "docs.google.com") {
      id =
        url.pathname.match(
          /^\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{10,200})(?:\/(?:edit|view|htmlview|copy|preview))?\/?$/,
        )?.[1] || null;
    } else if (url.hostname === "drive.google.com") {
      id =
        url.pathname.match(
          /^\/file\/d\/([A-Za-z0-9_-]{10,200})(?:\/(?:view|edit|preview))?\/?$/,
        )?.[1] || null;
      if (url.pathname === "/open") id = url.searchParams.get("id");
    }
    return id && fileId.test(id) ? id : null;
  } catch {
    return null;
  }
}
