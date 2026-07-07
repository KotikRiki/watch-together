import { useEffect, useCallback, useRef } from "react";

/**
 * Detects iOS Safari standalone mode.
 */
export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

/**
 * iOS Safari detection.
 */
export function isIOSSafari(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

/**
 * Improved scroll trick — temporarily unlocks body overflow, scrolls to trigger
 * Safari address bar hide, then re-locks. Multiple attempts with delays.
 */
export function tryHideSafariBars() {
  if (!isIOSSafari() || isStandalone()) return;

  const doScroll = () => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "auto";

    requestAnimationFrame(() => {
      window.scrollTo(0, 1);
      requestAnimationFrame(() => {
        window.scrollTo(0, Math.max(document.body.scrollHeight, window.innerHeight * 1.5));
        setTimeout(() => {
          document.body.style.overflow = prevOverflow || "hidden";
        }, 120);
      });
    });
  };

  setTimeout(doScroll, 50);
  setTimeout(doScroll, 250);
  setTimeout(doScroll, 600);
}

/**
 * Hook — triggers scroll trick on orientation/resize changes on iOS Safari.
 */
export function useSafariTabHider(enabled: boolean) {
  const lastLandscapeRef = useRef(false);

  const measure = useCallback(() => {
    if (!enabled || !isIOSSafari() || isStandalone()) return;

    const isLandscape =
      window.matchMedia("(orientation: landscape)").matches ||
      window.innerWidth > window.innerHeight;

    if (isLandscape && !lastLandscapeRef.current) {
      // Just entered landscape — fire scroll trick
      tryHideSafariBars();
    }
    lastLandscapeRef.current = isLandscape;
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !isIOSSafari()) return;

    measure();
    window.addEventListener("resize", measure, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(measure, 200), { passive: true });

    return () => {
      window.removeEventListener("resize", measure);
    };
  }, [enabled, measure]);
}
