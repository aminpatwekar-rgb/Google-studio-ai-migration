import { useReducedMotion } from "framer-motion";

export const SPRING_PRESS = {
  type: "spring" as const,
  stiffness: 500,
  damping: 30,
};

export const SPRING_SMOOTH = {
  type: "spring" as const,
  stiffness: 400,
  damping: 28,
};

export function getPressProps(
  shouldReduceMotion?: boolean | null,
  options?: { hoverScale?: number; tapScale?: number; xHover?: number; disabled?: boolean },
) {
  if (shouldReduceMotion || options?.disabled) {
    return {};
  }
  const hoverProps =
    options?.xHover !== undefined ? { x: options.xHover } : { scale: options?.hoverScale ?? 1.015 };

  return {
    whileHover: hoverProps,
    whileTap: { scale: options?.tapScale ?? 0.96 },
    transition: SPRING_PRESS,
  };
}

export function useInteractiveMotion(options?: {
  hoverScale?: number;
  tapScale?: number;
  disabled?: boolean;
}) {
  const shouldReduceMotion = useReducedMotion();
  return getPressProps(shouldReduceMotion, options);
}

export function listItemMotion(index = 0, shouldReduceMotion = false) {
  if (shouldReduceMotion) {
    return { layout: true };
  }

  return {
    layout: true,
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, scale: 0.96 },
    transition: {
      delay: Math.min(index * 0.035, 0.35),
      duration: 0.22,
      ease: [0.22, 1, 0.36, 1],
    },
  };
}
