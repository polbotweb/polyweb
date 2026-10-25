/** Boutons destructifs : `data-confirm="message"` → confirmation avant soumission. */
export function initConfirmButtons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLButtonElement>("button[data-confirm]").forEach((btn) => {
    if (btn.dataset.confirmReady) return;
    btn.dataset.confirmReady = "1";
    btn.addEventListener("click", (e) => {
      if (!confirm(btn.dataset.confirm!)) e.preventDefault();
    });
  });
}
