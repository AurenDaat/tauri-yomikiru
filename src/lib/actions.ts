/** Page / cover image actions: Save, Copy, Share (native share sheet when available). */

export async function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  bmp.close?.();
  return await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));
}

export async function copyBlob(blob: Blob) {
  const png = await toPng(blob);
  // @ts-ignore - ClipboardItem is available in modern webviews
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

export async function shareBlob(blob: Blob, title: string) {
  const file = new File([blob], `${title.replace(/[^\w\-. ]+/g, "_")}.jpg`, {
    type: blob.type || "image/jpeg",
  });
  const nav: any = navigator;
  if (nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title });
    return true;
  }
  await saveBlob(blob, file.name);
  return false;
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  saveBlob(blob, filename);
}

export function pickJsonFile(): Promise<any | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try {
        resolve(JSON.parse(await f.text()));
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}
