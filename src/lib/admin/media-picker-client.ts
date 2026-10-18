/**
 * Ouvre un <MediaPicker id="…"> (atom atomic) et résout avec le média choisi,
 * ou `null` si la fenêtre est fermée sans sélection.
 */
export interface PickedMedia { fileId: string; url: string; alt: string; filename?: string }

export function pickMedia(pickerId: string): Promise<PickedMedia | null> {
  const picker = document.getElementById(pickerId);
  if (!picker) return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const onSelect = (event: Event) => {
      done = true;
      cleanup();
      resolve((event as CustomEvent<PickedMedia>).detail);
    };
    const observer = new MutationObserver(() => {
      if (picker.classList.contains("hidden") && !done) {
        cleanup();
        resolve(null);
      }
    });
    function cleanup() {
      picker!.removeEventListener("media-select", onSelect);
      observer.disconnect();
    }
    picker.addEventListener("media-select", onSelect);
    observer.observe(picker, { attributes: true, attributeFilter: ["class"] });
    picker.dispatchEvent(new Event("open"));
  });
}

/** Upload direct (repli sans MediaPicker) via /api/upload — retourne l'URL publique. */
export async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("type", "media");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data.url;
}
