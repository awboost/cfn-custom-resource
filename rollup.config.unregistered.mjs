import sourcemaps from "@gordonmleigh/rollup-plugin-sourcemaps";
import zip from "@gordonmleigh/rollup-plugin-zip";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import swc from "@rollup/plugin-swc";
import builtin from "builtin-modules";

export default {
  input: "src/test/handlers-unregistered.ts",

  output: {
    file: "dist/index.mjs",
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
    zip({
      outputFileName: "bundle-unregistered.zip",
      overrideModifiedDate: new Date(0),
    }),
  ],

  external: (id) => builtin.includes(id),
};
