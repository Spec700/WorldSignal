"use client";

import { useLayoutEffect, useRef, useState } from "react";

interface ElementSize {
  height: number;
  width: number;
}

const EMPTY_SIZE: ElementSize = { height: 0, width: 0 };

export function useElementSize<T extends HTMLElement>() {
  const elementRef = useRef<T>(null);
  const [size, setSize] = useState<ElementSize>(EMPTY_SIZE);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }

    const measure = () => {
      const bounds = element.getBoundingClientRect();
      setSize((current) => {
        const next = {
          height: Math.round(bounds.height),
          width: Math.round(bounds.width),
        };
        return current.height === next.height && current.width === next.width
          ? current
          : next;
      });
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [elementRef, size] as const;
}
