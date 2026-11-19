import esbuild from "esbuild";
import path from "node:path";

const entries = ["background", "content", "popup"];
const outdir = process.env.EXTENSION_OUTDIR ?? "PageToPaper/Extension/Resources";

await Promise.all(
  entries.map((name) =>
    esbuild.build({
      entryPoints: [`src/${name}.ts`],
      outfile: path.join(outdir, `${name}.js`),
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
