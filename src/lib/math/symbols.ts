/** Symbol palettes and LaTeX templates used by the equation builder. */

export type Symbol = { label: string; latex: string; hint?: string };
export type SymbolGroup = { id: string; name: string; symbols: Symbol[] };

export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    id: "basic",
    name: "Basic",
    symbols: [
      { label: "+", latex: "+" },
      { label: "−", latex: "-" },
      { label: "×", latex: "\\times " },
      { label: "÷", latex: "\\div " },
      { label: "±", latex: "\\pm " },
      { label: "=", latex: "=" },
      { label: "≠", latex: "\\neq " },
      { label: "≈", latex: "\\approx " },
      { label: "<", latex: "<" },
      { label: ">", latex: ">" },
      { label: "≤", latex: "\\le " },
      { label: "≥", latex: "\\ge " },
      { label: "%", latex: "\\%" },
      { label: "·", latex: "\\cdot " },
    ],
  },
  {
    id: "structures",
    name: "Structures",
    symbols: [
      { label: "a/b", latex: "\\frac{a}{b}", hint: "Fraction" },
      { label: "x²", latex: "x^{2}", hint: "Power" },
      { label: "xₙ", latex: "x_{n}", hint: "Subscript" },
      { label: "√", latex: "\\sqrt{x}", hint: "Square root" },
      { label: "ⁿ√", latex: "\\sqrt[n]{x}", hint: "Nth root" },
      { label: "∑", latex: "\\sum_{i=1}^{n} ", hint: "Sum" },
      { label: "∏", latex: "\\prod_{i=1}^{n} ", hint: "Product" },
      { label: "∫", latex: "\\int_{a}^{b} ", hint: "Integral" },
      { label: "lim", latex: "\\lim_{x \\to 0} ", hint: "Limit" },
      { label: "d/dx", latex: "\\frac{d}{dx} ", hint: "Derivative" },
      { label: "( )", latex: "\\left( \\right)" },
      { label: "| |", latex: "\\left| x \\right|" },
      {
        label: "{ }",
        latex: "\\begin{cases} a & x>0 \\\\ b & x\\le 0 \\end{cases}",
        hint: "Cases",
      },
    ],
  },
  {
    id: "greek",
    name: "Greek",
    symbols: [
      { label: "α", latex: "\\alpha " },
      { label: "β", latex: "\\beta " },
      { label: "γ", latex: "\\gamma " },
      { label: "δ", latex: "\\delta " },
      { label: "Δ", latex: "\\Delta " },
      { label: "θ", latex: "\\theta " },
      { label: "λ", latex: "\\lambda " },
      { label: "μ", latex: "\\mu " },
      { label: "π", latex: "\\pi " },
      { label: "ρ", latex: "\\rho " },
      { label: "σ", latex: "\\sigma " },
      { label: "φ", latex: "\\phi " },
      { label: "ω", latex: "\\omega " },
      { label: "Ω", latex: "\\Omega " },
    ],
  },
  {
    id: "relations",
    name: "Sets & logic",
    symbols: [
      { label: "∈", latex: "\\in " },
      { label: "∉", latex: "\\notin " },
      { label: "⊂", latex: "\\subset " },
      { label: "∪", latex: "\\cup " },
      { label: "∩", latex: "\\cap " },
      { label: "∅", latex: "\\emptyset " },
      { label: "∀", latex: "\\forall " },
      { label: "∃", latex: "\\exists " },
      { label: "→", latex: "\\to " },
      { label: "⇒", latex: "\\Rightarrow " },
      { label: "⇔", latex: "\\Leftrightarrow " },
      { label: "∞", latex: "\\infty " },
      { label: "∴", latex: "\\therefore " },
      { label: "∠", latex: "\\angle " },
    ],
  },
  {
    id: "chem",
    name: "Chemistry",
    symbols: [
      { label: "H₂O", latex: "\\ce{H2O}" },
      { label: "→", latex: "\\ce{->}" },
      { label: "⇌", latex: "\\ce{<=>}" },
      { label: "↑", latex: "\\ce{^}" },
      { label: "↓", latex: "\\ce{v}" },
      { label: "aq", latex: "\\ce{(aq)}" },
      { label: "Δ", latex: "\\overset{\\Delta}{\\longrightarrow}" },
      { label: "ion", latex: "\\ce{SO4^2-}" },
      { label: "isotope", latex: "\\ce{^{14}_{6}C}" },
    ],
  },
];

export function fractionLatex(numerator: string, denominator: string) {
  return `\\frac{${numerator || "a"}}{${denominator || "b"}}`;
}

export function matrixLatex(rows: string[][], delimiter: "p" | "b" | "v" | "B" = "b") {
  const body = rows.map((r) => r.map((c) => c || "0").join(" & ")).join(" \\\\ ");
  return `\\begin{${delimiter}matrix} ${body} \\end{${delimiter}matrix}`;
}

export function emptyMatrix(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
}
