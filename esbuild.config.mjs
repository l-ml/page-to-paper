import esbuild from "esbuild";

const entries = ["background", "content", "popup"];

await Promise.all(
  entries.map((name) =>
    esbuild.build({
      entryPoints: [`src/${name}.ts`],
      outfile: `PageToPaper/Extension/Resources/${name}.js`,
      bundle: true,
      format: "iife",
      target: "safari15",
      legalComments: "none",
      banner: {
        js: "/* Generated from src/ by esbuild. Do not edit. */",
      },
    }),
  ),
);
