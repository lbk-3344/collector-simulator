// Announcement image validation shared by POST /api/announcements and
// PATCH /api/announcements/[id] (BL-075). Images are stored inline as base64
// data: URLs on the row — no image hosting exists in this app yet (BL-008).

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB — matches the client-side check

// Rough byte size of a base64 data: URL's payload (4 base64 chars ≈ 3 bytes).
function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((b64.length * 3) / 4);
}

export function validateImageData(
  imageData: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (imageData == null || imageData === "") return { ok: true, value: null };
  if (typeof imageData !== "string" || !/^data:image\/[a-z0-9.+-]+;base64,/i.test(imageData)) {
    return { ok: false, error: "The image must be a base64 data: URL." };
  }
  if (dataUrlByteLength(imageData) > MAX_IMAGE_BYTES) {
    return { ok: false, error: "The image is larger than 2MB." };
  }
  return { ok: true, value: imageData };
}
