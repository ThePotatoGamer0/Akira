import { useEffect, type RefObject } from "react";
import gsap from "gsap";

/** GSAP quickTo card tilt. The driver receives the pointer; only the target rotates. */
export function useGsapCardTilt(
  driver: RefObject<HTMLElement | null>,
  target: RefObject<HTMLElement | null>,
  max = 12,
  space: "driver" | "target" = "target",
) {
  useEffect(() => {
    const area = driver.current;
    const card = target.current;
    if (!area || !card) return;
    const areaEl: HTMLElement = area;
    const cardEl: HTMLElement = card;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const glare = cardEl.querySelector<HTMLElement>(".card-glare");
    gsap.set(cardEl, { transformPerspective: 900, transformOrigin: "center center" });
    const rotX = gsap.quickTo(cardEl, "rotationX", { duration: 0.6, ease: "power3.out" });
    const rotY = gsap.quickTo(cardEl, "rotationY", { duration: 0.6, ease: "power3.out" });
    const glareX = glare ? gsap.quickTo(glare, "x", { duration: 0.45, ease: "power3.out" }) : null;
    const glareY = glare ? gsap.quickTo(glare, "y", { duration: 0.45, ease: "power3.out" }) : null;

    function point(event: PointerEvent) {
      const tiltBox = (space === "driver" ? areaEl : cardEl).getBoundingClientRect();
      const px = (event.clientX - tiltBox.left) / tiltBox.width - 0.5;
      const py = (event.clientY - tiltBox.top) / tiltBox.height - 0.5;
      rotY(px * max);
      rotX(-py * max);

      const cardBox = cardEl.getBoundingClientRect();
      const gx = Math.min(0.5, Math.max(-0.5, (event.clientX - cardBox.left) / cardBox.width - 0.5));
      const gy = Math.min(0.5, Math.max(-0.5, (event.clientY - cardBox.top) / cardBox.height - 0.5));
      glareX?.(gx * cardBox.width);
      glareY?.(gy * cardBox.height);
    }

    function enter() {
      if (glare) gsap.to(glare, { opacity: 1, duration: 0.3, overwrite: "auto" });
    }

    function leave() {
      rotX(0);
      rotY(0);
      glareX?.(0);
      glareY?.(0);
      if (glare) gsap.to(glare, { opacity: 0, duration: 0.4, overwrite: "auto" });
    }

    areaEl.addEventListener("pointermove", point);
    areaEl.addEventListener("pointerenter", enter);
    areaEl.addEventListener("pointerleave", leave);
    return () => {
      areaEl.removeEventListener("pointermove", point);
      areaEl.removeEventListener("pointerenter", enter);
      areaEl.removeEventListener("pointerleave", leave);
      gsap.killTweensOf(glare ? [cardEl, glare] : cardEl);
    };
  }, [driver, target, max, space]);
}
