import { Extension, InputRule } from "@tiptap/core";

/**
 * Typing $x^2$ turns into a rendered equation as soon as the closing $ is typed, and
 * $$...$$ at the start of a line becomes a centered block equation.
 */
export const MathShortcuts = Extension.create({
  name: "mathShortcuts",

  addInputRules() {
    return [
      new InputRule({
        find: /^\$\$(?=\S)([^$\n]+?)\$\$$/,
        handler: ({ state, range, match }) => {
          const latex = match[1]?.trim();
          const type = state.schema.nodes["blockMath"];
          if (!latex || !type) return null;
          const $from = state.doc.resolve(range.from);
          const wholeLine =
            $from.depth > 0 &&
            $from.parent.isTextblock &&
            range.from === $from.start() &&
            range.to === $from.end();
          const from = wholeLine ? $from.before() : range.from;
          const to = wholeLine ? $from.after() : range.to;
          state.tr.replaceWith(from, to, type.create({ latex }));
          return undefined;
        },
      }),
      new InputRule({
        find: /(?:^|[^\\$])\$(?=\S)([^$\n]*?\S)\$$/,
        handler: ({ state, range, match }) => {
          const latex = match[1];
          const type = state.schema.nodes["inlineMath"];
          if (!latex || !type) return null;
          // "$5 and $" is a price in a sentence, not an equation.
          if (/\s[A-Za-z]{3,}/.test(latex)) return null;
          const prefix = match[0].length - (latex.length + 2);
          state.tr.replaceWith(range.from + prefix, range.to, type.create({ latex }));
          return undefined;
        },
      }),
    ];
  },
});
