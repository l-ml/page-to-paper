import esbuild from "esbuild";
import path from "node:path";

const entries = ["background", "content", "popup"];
const outdir = process.env.EXTENSION_OUTDIR ?? "PageToPaper/Extension/Resources";

const defaultBanner = "/* Generated from src/ by esbuild. Do not edit. */";
const contentBanner = `${defaultBanner}
/*
 * Bundles @mozilla/readability 0.6.0 (Apache License, Version 2.0):
 * Copyright (c) 2010 Arc90 Inc
 * Licensed under the Apache License, Version 2.0 (Apache License, Version 2.0)
 */`;

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
        js: name === "content" ? contentBanner : defaultBanner,
      },
    }),
  ),
);
