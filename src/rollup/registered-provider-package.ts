import { validateResourceTypeSchema } from "@awboost/cfn-resource-schemas/meta";
import type { ResourceTypeSchema } from "@awboost/cfn-resource-schemas/types";
import archiver from "archiver";
import { readFile } from "fs/promises";
import { basename, dirname, extname, join } from "path";
import type { OutputChunk, Plugin } from "rollup";
import { format } from "util";

const ConfigTargetPath = ".rpdk-config";
const PluginName = "resource-provider-package";
const SchemaTargetPath = "schema.json";

/**
 * Configuration for Resource Provider Development Kit. Unfortunately I've no
 * idea what most of these do, and the available documentation is pretty scant.
 */
export type RpdkConfigSettings = {
  artifact_type?: string | null;
  endpoint_url?: string | null;
  force?: boolean;
  no_docker?: boolean;
  profile?: string | null;
  protocolVersion?: "2.0.0";
  region?: string | null;
  subparser_name?: string | null;
  target_schemas?: string[];
  type_name?: string | null;
  use_docker?: boolean;
  verbose?: number;
  version?: boolean;
};

/**
 * Configuration for Resource Provider Development Kit.
 */
export type RpdkConfig = {
  artifact_type: "RESOURCE";
  typeName: string;
  language: "typescript";
  runtime: "nodejs20.x" | "nodejs18.x";
  entrypoint: string;
  testEntrypoint: string;
  settings: RpdkConfigSettings;
};

const DefaultConfig: Partial<RpdkConfig> = {
  artifact_type: "RESOURCE",
  language: "typescript",
  runtime: "nodejs20.x",
  settings: {
    protocolVersion: "2.0.0",
  },
};

export type RollupRegisteredResourcePluginOptions = {
  /**
   * The name of the inner zip file containing the code.
   * @default "ResourceProvider.zip"
   */
  codePackagePath?: string;
  /**
   * Config for the Resource Provider Development Kit.
   */
  config?: Partial<RpdkConfig>;
  /**
   * Path to the `.rpdk-config` file.
   */
  configSourcePath?: string;
  /**
   * The name of the zip file.
   * @default "bundle.zip"
   */
  outputFileName?: string;
  /**
   * So an explicit last modified date. Useful to keep zip hashes identical when
   * the contents haven't changed.
   */
  overrideModifiedDate?: Date;
  /**
   * The Resource Provider Schema.
   * @see {@link https://docs.aws.amazon.com/cloudformation-cli/latest/userguide/resource-type-schema.html}
   */
  schema?: ResourceTypeSchema;
  /**
   * The path to the schema file for the resource provider.
   */
  schemaSourcePath?: string;
};

function stripExt(path: string): string {
  return join(dirname(path), basename(path, extname(path)));
}

export function resourceProviderPackage(
  options: RollupRegisteredResourcePluginOptions,
): Plugin {
  const {
    codePackagePath = "ResourceProvider.zip",
    configSourcePath,
    outputFileName = "bundle.zip",
    overrideModifiedDate,
    schemaSourcePath,
  } = options ?? {};

  let config = options.config ?? {};
  let schema = options.schema;

  return {
    name: PluginName,

    async buildStart() {
      if (configSourcePath) {
        config = JSON.parse(await readFile(configSourcePath, "utf-8"));
      }
      config = {
        ...DefaultConfig,
        ...config,
        settings: { ...DefaultConfig.settings, ...config.settings },
      };
      if (schemaSourcePath) {
        schema = JSON.parse(await readFile(schemaSourcePath, "utf-8"));
      }
      if (!schema) {
        return this.error(`config "schema" or "schemaSourcePath" is required`);
      }

      const schemaValidation = validateResourceTypeSchema(schema);
      if (!schemaValidation.ok) {
        for (const error of schemaValidation.errors) {
          this.warn(
            format(
              'schema validation ("%s"): %s %o',
              error.instancePath,
              error.message,
              error.params,
            ),
          );
        }
        this.error(`schema validation failed`);
      } else {
        this.info(`schema validated successfully`);
      }

      if (!config.typeName) {
        config.typeName = schema.typeName;
      } else if (config.typeName !== schema.typeName) {
        this.error(`schema.typeName must match config.typeName`);
      }
    },

    async renderStart(outputOptions) {
      if (outputOptions.format === "es") {
        if (!checkExt(outputOptions.entryFileNames, ".mjs")) {
          this.error(
            `output.entryFileNames must have ".mjs" extension when output.format is "es"`,
          );
        }
        if (!checkExt(outputOptions.chunkFileNames, ".mjs")) {
          this.error(
            `output.chunkFileNames must have ".mjs" extension when output.format is "es"`,
          );
        }
      } else if (outputOptions.format !== "cjs") {
        this.error(`output.format must be "es" or "cjs"`);
      }
    },

    async generateBundle(opts, bundle) {
      // The required format for the resource provider is a zip containing:
      //
      //   - Another zip which contains the code files
      //   - The schema file (schema.json)
      //   - The config file (.rpdk-config)
      //
      // Unfortunately as of now, this format isn't documented anywhere.

      // help the package consumer out by validating the entrypoints
      const exports = Object.values(bundle)
        .filter((x): x is OutputChunk => x.type === "chunk" && x.isEntry)
        .flatMap((x) =>
          x.exports.map((exp) => `${stripExt(x.fileName)}.${exp}`),
        );

      if (!config.entrypoint) {
        this.error(`options: config.entrypoint is required`);
      } else if (!exports.includes(config.entrypoint)) {
        this.info(`found entrypoints: ${exports}`);
        this.error(
          `options: config.entrypoint "${config.entrypoint}" not found`,
        );
      }

      if (config.testEntrypoint && !exports.includes(config.testEntrypoint)) {
        this.info(`found entrypoints: ${exports}`);
        this.error(
          `options: config.testEntrypoint "${config.testEntrypoint}" not found`,
        );
      }

      const innerZip = archiver("zip", { zlib: { level: 9 } });
      const names = Object.keys(bundle).sort((a, b) => a.localeCompare(b));
      const date = overrideModifiedDate ?? new Date();

      let error: unknown;

      innerZip.on("error", (err: unknown) => {
        error = err || new Error(`unknown error occurred`);
      });

      // add all the build chunks/assets to the inner (code) zip
      for (const name of names) {
        const chunkOrAsset = bundle[name];
        delete bundle[name];

        if (chunkOrAsset.type === "asset") {
          innerZip.append(Buffer.from(chunkOrAsset.source), {
            name: chunkOrAsset.fileName,
            date,
          });
        } else if (chunkOrAsset.type === "chunk") {
          innerZip.append(chunkOrAsset.code, {
            name: chunkOrAsset.fileName,
            date,
          });
        }
      }

      // don't await this because it can hang forever
      void innerZip.finalize();

      // now start building the outer zip (with code zip, schema, and config)
      const outerZip = archiver("zip", { zlib: { level: 9 } });

      outerZip.append(innerZip, {
        name: codePackagePath,
        date,
      });

      outerZip.append(JSON.stringify(schema), {
        name: SchemaTargetPath,
        date,
      });

      outerZip.append(JSON.stringify(config), {
        name: ConfigTargetPath,
        date,
      });

      // don't await this because it can hang forever
      void outerZip.finalize();

      const chunks: Buffer[] = [];
      for await (const chunk of outerZip) {
        chunks.push(chunk);
      }

      if (error) {
        throw error;
      }

      this.emitFile({
        type: "asset",
        fileName: outputFileName,
        source: Buffer.concat(chunks),
      });
    },
  };
}

function checkExt(
  fileName: string | ((...args: any[]) => unknown),
  ext: string,
): boolean {
  if (typeof fileName === "function") {
    // can't check the extension, assume it's correct
    return true;
  }
  return fileName.endsWith(ext);
}
