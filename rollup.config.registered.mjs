import sourcemaps from "@gordonmleigh/rollup-plugin-sourcemaps";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import swc from "@rollup/plugin-swc";
import builtin from "builtin-modules";
import { resourceProviderPackage } from "./lib/rollup/registered-provider-package.js";

export default {
  input: { index: "src/test/handlers-registered.ts" },

  output: {
    chunkFileNames: "[name]-[hash].mjs",
    dir: "dist",
    entryFileNames: "[name].mjs",
    format: "esm",
    sourcemap: true,
    sourcemapIgnoreList: false,
  },

  plugins: [
    resolve({ extensions: [".js", ".ts"] }),
    json(),
    swc(),
    commonjs(),
    sourcemaps(),
    resourceProviderPackage({
      outputFileName: "bundle-registered.zip",
      overrideModifiedDate: new Date(0),
      schemaSourcePath: "./test-schema.json",
      config: {
        entrypoint: "index.entrypoint",
      },
    }),
  ],

  external: (id) => builtin.includes(id),
};
