/** Share helpers: the share sheet when available, otherwise the clipboard or a download. */
export async function shareText(text: string, title = "TELL"): Promise<"shared" | "copied" | "failed"> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; clipboard?: Clipboard };
  if (nav.share) {
    try {
      await nav.share({ text, title });
      return "shared";
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return "failed";
    }
  }
  try {
    await nav.clipboard?.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

export async function shareFile(blob: Blob, name: string, title = "TELL"): Promise<"shared" | "downloaded" | "failed"> {
  const file = new File([blob], name, { type: blob.type });
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return "shared";
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return "failed";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
