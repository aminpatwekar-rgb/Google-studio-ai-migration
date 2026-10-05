// $$block$$ or $inline$. Inline math may not start or end with whitespace and may not be
// followed by a digit, so plain prices such as "$5 and $10" are left as text.
export const MATH_PATTERN = /\$\$([\s\S]+?)\$\$|\$(?=\S)([^$\n]*?\S)\$(?!\d)/;

export function containsMath(value: string): boolean {
  return MATH_PATTERN.test(value);
}
