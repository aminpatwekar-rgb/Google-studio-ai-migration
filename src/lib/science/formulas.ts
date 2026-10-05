/**
 * Static formula library for science subjects.
 * Every entry is plain LaTeX (mhchem syntax for chemistry) — nothing is generated.
 */

export type Formula = { name: string; latex: string; note?: string };
export type FormulaSection = { id: string; title: string; formulas: Formula[] };

export const FORMULA_LIBRARY: FormulaSection[] = [
  {
    id: "mechanics",
    title: "Physics · Mechanics",
    formulas: [
      { name: "Velocity", latex: "v = \\frac{\\Delta s}{\\Delta t}" },
      { name: "Acceleration", latex: "a = \\frac{v - u}{t}" },
      { name: "Equation of motion", latex: "s = ut + \\tfrac{1}{2}at^{2}" },
      { name: "Velocity–displacement", latex: "v^{2} = u^{2} + 2as" },
      { name: "Newton's second law", latex: "F = ma" },
      { name: "Momentum", latex: "p = mv" },
      { name: "Work", latex: "W = F s \\cos\\theta" },
      { name: "Kinetic energy", latex: "E_k = \\tfrac{1}{2}mv^{2}" },
      { name: "Potential energy", latex: "E_p = mgh" },
      { name: "Power", latex: "P = \\frac{W}{t}" },
      { name: "Gravitation", latex: "F = G\\frac{m_1 m_2}{r^{2}}" },
    ],
  },
  {
    id: "waves-electricity",
    title: "Physics · Waves & electricity",
    formulas: [
      { name: "Wave speed", latex: "v = f\\lambda" },
      { name: "Ohm's law", latex: "V = IR" },
      { name: "Electrical power", latex: "P = VI = I^{2}R" },
      { name: "Capacitance", latex: "C = \\frac{Q}{V}" },
      { name: "Coulomb's law", latex: "F = k\\frac{q_1 q_2}{r^{2}}" },
      { name: "Snell's law", latex: "n_1\\sin\\theta_1 = n_2\\sin\\theta_2" },
      { name: "Photon energy", latex: "E = hf = \\frac{hc}{\\lambda}" },
      { name: "Mass–energy", latex: "E = mc^{2}" },
    ],
  },
  {
    id: "chem-general",
    title: "Chemistry · General",
    formulas: [
      { name: "Moles", latex: "n = \\frac{m}{M}" },
      { name: "Concentration", latex: "c = \\frac{n}{V}" },
      { name: "Ideal gas law", latex: "pV = nRT" },
      { name: "pH", latex: "\\mathrm{pH} = -\\log_{10}[\\ce{H+}]" },
      { name: "Rate of reaction", latex: "\\text{rate} = \\frac{\\Delta[\\ce{A}]}{\\Delta t}" },
      {
        name: "Enthalpy change",
        latex: "\\Delta H = H_{\\text{products}} - H_{\\text{reactants}}",
      },
    ],
  },
  {
    id: "chem-equations",
    title: "Chemistry · Equations",
    formulas: [
      { name: "Combustion of methane", latex: "\\ce{CH4 + 2O2 -> CO2 + 2H2O}" },
      { name: "Neutralisation", latex: "\\ce{HCl + NaOH -> NaCl + H2O}" },
      { name: "Haber process", latex: "\\ce{N2 + 3H2 <=>[\\text{Fe}] 2NH3}" },
      { name: "Photosynthesis", latex: "\\ce{6CO2 + 6H2O -> C6H12O6 + 6O2}" },
      { name: "Precipitation", latex: "\\ce{AgNO3(aq) + NaCl(aq) -> AgCl(v) + NaNO3(aq)}" },
      { name: "Isotope notation", latex: "\\ce{^{235}_{92}U}" },
    ],
  },
  {
    id: "maths",
    title: "Mathematics",
    formulas: [
      { name: "Quadratic formula", latex: "x = \\frac{-b \\pm \\sqrt{b^{2}-4ac}}{2a}" },
      { name: "Pythagoras", latex: "a^{2} + b^{2} = c^{2}" },
      { name: "Binomial theorem", latex: "(a+b)^{n} = \\sum_{k=0}^{n}\\binom{n}{k}a^{n-k}b^{k}" },
      { name: "Sine rule", latex: "\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C}" },
      { name: "Cosine rule", latex: "c^{2} = a^{2}+b^{2}-2ab\\cos C" },
      { name: "Derivative definition", latex: "f'(x) = \\lim_{h\\to 0}\\frac{f(x+h)-f(x)}{h}" },
      { name: "Integration by parts", latex: "\\int u\\,dv = uv - \\int v\\,du" },
    ],
  },
];
