export function initCarousel(container: HTMLElement) {
  const prevBtn = container.parentElement?.querySelector(
    "[data-prev]"
  ) as HTMLButtonElement | null;

  const nextBtn = container.parentElement?.querySelector(
    "[data-next]"
  ) as HTMLButtonElement | null;

  if (!prevBtn || !nextBtn) return;

  const getStep = () => {
    const first = container.querySelector("a") as HTMLElement | null;
    if (!first) return 320;
    return first.clientWidth + 24;
  };

  const update = () => {
    prevBtn.disabled = container.scrollLeft <= 0;
    nextBtn.disabled =
      container.scrollLeft >=
      container.scrollWidth - container.clientWidth - 1;
  };

  prevBtn.addEventListener("click", () => {
    container.scrollBy({ left: -getStep(), behavior: "smooth" });
  });

  nextBtn.addEventListener("click", () => {
    container.scrollBy({ left: getStep(), behavior: "smooth" });
  });

  container.addEventListener("scroll", update);
  window.addEventListener("resize", update);

  update();
}

export function setupCarousels() {
  const carousels = document.querySelectorAll(".starwind-carousel");

  carousels.forEach((carousel) => {
    if (carousel instanceof HTMLElement) {
      initCarousel(carousel);
    }
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", setupCarousels);
  document.addEventListener("astro:after-swap", setupCarousels);
}
