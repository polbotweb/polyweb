/**
 * initMarkdownEditors — initialise EasyMDE sur chaque [data-md-editor]
 * (repris de concordia `src/lib/admin/markdown-editor.ts`).
 *
 * Images : MediaPicker partagé si `data-md-picker` est fourni, sinon upload
 * direct via /api/upload. Idempotent (un wrapper déjà initialisé est ignoré).
 */
import EasyMDE from "easymde";
import "easymde/dist/easymde.min.css";
import { pickMedia, uploadImage } from "./media-picker-client";

const instances = new Map<string, EasyMDE>();

function insertImage(editor: EasyMDE, url: string, alt: string) {
  const cm = editor.codemirror;
  const safeAlt = alt.replace(/[[\]]/g, "");
  cm.replaceRange(`![${safeAlt}](${url})`, cm.getCursor());
}

function makeImageButton(pickerId: string | undefined): EasyMDE.ToolbarIcon {
  return {
    name: "upload-image",
    className: "upload-image",
    title: "Insérer une image",
    action: async (editor: EasyMDE) => {
      if (pickerId) {
        const picked = await pickMedia(pickerId);
        if (picked) insertImage(editor, picked.url, picked.alt || picked.filename || "image");
        return;
      }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png,image/webp,image/avif,image/svg+xml";
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          insertImage(editor, await uploadImage(file), file.name);
        } catch (err) {
          alert(`Erreur upload : ${(err as Error).message}`);
        }
      });
      input.click();
    },
  };
}

export function initMarkdownEditors(): Map<string, EasyMDE> {
  document.querySelectorAll<HTMLElement>("[data-md-editor]").forEach((wrapper) => {
    const id = wrapper.dataset.mdEditor!;
    if (wrapper.dataset.mdReady === "true") return;
    const textarea = wrapper.querySelector<HTMLTextAreaElement>("textarea");
    if (!textarea) return;
    const minimal = wrapper.dataset.mdMinimal === "true";
    const img = makeImageButton(wrapper.dataset.mdPicker || undefined);
    const full: (EasyMDE.ToolbarIcon | string)[] = ["bold", "italic", "strikethrough", "heading", "|", "quote", "unordered-list", "ordered-list", "horizontal-rule", "|", "link", img, "table", "code", "|", "preview", "side-by-side", "fullscreen", "|", "guide"];
    const small: (EasyMDE.ToolbarIcon | string)[] = ["bold", "italic", "heading", "|", "unordered-list", "link", img, "|", "preview"];
    const mde = new EasyMDE({
      element: textarea,
      toolbar: (minimal ? small : full) as EasyMDE.Options["toolbar"],
      autoDownloadFontAwesome: false,
      spellChecker: false,
      status: minimal ? false : ["lines", "words", "cursor"],
      placeholder: textarea.placeholder || "",
      minHeight: minimal ? "120px" : "300px",
      sideBySideFullscreen: false,
      renderingConfig: { singleLineBreaks: false, codeSyntaxHighlighting: false },
      shortcuts: { drawImage: null },
    });
    // Garder le <textarea> synchronisé pour les soumissions de formulaire classiques.
    mde.codemirror.on("change", () => { textarea.value = mde.value(); textarea.dispatchEvent(new Event("input", { bubbles: true })); });
    wrapper.dataset.mdReady = "true";
    instances.set(id, mde);
  });
  return instances;
}

export function getMarkdownEditor(id: string): EasyMDE | undefined {
  return instances.get(id);
}
