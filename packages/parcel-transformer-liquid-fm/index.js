const { ThrowableError } = require("@parcel/diagnostic");
const { Transformer } = require("@parcel/plugin");
const { Liquid } = require("liquidjs");
const fm = require("front-matter");
const LiquidFS = require("./liquidFS");
const globalData = require("./globalData");

/**
 * Finds a dependency file (layout or partial) within a set of directories.
 * @param {string} filename - The name of the dependency file.
 * @param {string[]} searchDirs - The directories to search for the file.
 * @param {object} liquidFs - The custom Liquid filesystem.
 * @param {string} extname - The file extension to append.
 * @returns {string|null} The full path to the file, or null if not found.
 */
function findDependencyPath(filename, searchDirs, liquidFs, extname) {
  const dirs = Array.isArray(searchDirs) ? searchDirs : [searchDirs];
  for (const dir of dirs) {
    const resolvedPath = liquidFs.resolve(dir, filename, extname);
    if (liquidFs.existsSync(resolvedPath)) {
      return resolvedPath;
    }
  }
  return null;
}

/**
 * Recursively extracts data from layouts and partials referenced in the content.
 * @param {string} content - The Liquid content to scan for dependencies.
 * @param {import('@parcel/types').MutableAsset} asset - The Parcel asset.
 * @param {object} liquidFs - The custom Liquid filesystem.
 * @param {object} config - The transformer's configuration.
 * @returns {Promise<object>} An object containing the merged data from all dependencies.
 */
async function extractDependencyData(content, asset, liquidFs, config) {
  const layoutRegex = /{%[-]*\s*layout\s+['"]([^'"]+)['"]/;
  const partialRegex = /{%[-]*\s*render\s+['"]([^'"]+)['"]/g;

  let allData = {};

  /**
   * Processes a single dependency file.
   * @param {string} filepath - The absolute path to the dependency file.
   * @returns {Promise<object>} The front matter from the file and its nested dependencies.
   */
  async function processFile(filepath) {
    asset.invalidateOnFileChange(filepath);
    const fileContent = liquidFs.readFileSync(filepath, "utf8");
    const { attributes, body } = fm(fileContent);

    // Recursively extract data from the body of this dependency.
    const nestedData = await extractDependencyData(body, asset, liquidFs, config);

    // Merge so that the current file's front matter can override nested data.
    return { ...nestedData, ...attributes };
  }

  // Process layout first
  const layoutMatch = content.match(layoutRegex);
  if (layoutMatch) {
    const filename = layoutMatch[1];
    const filepath = findDependencyPath(
      filename,
      config.layouts,
      liquidFs,
      config.extname
    );
    if (filepath) {
      const layoutData = await processFile(filepath);
      allData = { ...allData, ...layoutData };
    } else {
      console.warn(`Layout file not found: ${filename}`);
    }
  }

  // Process all partials in parallel
  const partialMatches = [...content.matchAll(partialRegex)];
  const partialDataPromises = partialMatches.map(async (match) => {
    const filename = match[1];
    const filepath = findDependencyPath(
      filename,
      config.partials,
      liquidFs,
      config.extname
    );
    if (filepath) {
      return processFile(filepath);
    }
    console.warn(`Partial file not found: ${filename}`);
    return {};
  });

  const partialsDataArray = await Promise.all(partialDataPromises);
  const mergedPartialsData = partialsDataArray.reduce(
    (acc, data) => ({ ...acc, ...data }),
    {}
  );
  allData = { ...allData, ...mergedPartialsData };
  return allData;
}

/**
 * A Parcel transformer for Liquid templates with front matter.
 */
module.exports = new Transformer({
  /**
   * Loads LiquidJS and site-wide configuration. It tracks all global data
   * files (like `config.yml` and collections) as dependencies.
   * @param {object} options - The options object.
   * @param {import('@parcel/types').Config} options.config - The Parcel configuration object.
   * @returns {Promise<object>} The merged configuration for the transformer.
   */
  async loadConfig({ config }) {
    // Load liquid-specific config from .liquidrc
    const liquidConfigResult = await config.getConfig([".liquidrc", ".liquidrc.js"], {
      packageKey: "liquid",
    });

    const liquidConfig = liquidConfigResult ? liquidConfigResult.contents : {};
    if (liquidConfigResult) {
      config.invalidateOnFileChange(liquidConfigResult.filePath);
    }

    // Load all site-wide data (from config.yml, collections, etc.)
    // This is done in loadConfig so Parcel tracks these files as dependencies.
    const siteData = await globalData(config);

    // Return a merged config object to be used in the transform function.
    return { ...liquidConfig, siteData };
  },

  /**
   * Transforms a Liquid asset into an HTML asset.
   * @param {object} options - The options object.
   * @param {import('@parcel/types').MutableAsset} options.asset - The asset to be transformed.
   * @param {object} options.config - The transformer's configuration from loadConfig.
   * @returns {Promise<Array<import('@parcel/types').MutableAsset>>} The transformed asset.
   */
  async transform({ asset, config }) {
    const code = await asset.getCode();
    const { attributes: pageData, body } = fm(code);

    // 1. Site data is now pre-loaded via loadConfig.
    const { siteData, ...liquidConfig } = config;

    // 2. Set up the Liquid engine with a custom filesystem resolver.
    const liquidFs = LiquidFS(asset, { ...siteData, page: pageData }, liquidConfig);

    // 3. Recursively find and process dependencies (layouts and partials).
    const dependencyData = await extractDependencyData(
      body,
      asset,
      liquidFs,
      liquidConfig
    );

    // 4. Assemble the final context, merging all data sources.
    // Precedence: page > layout/partials > site
    const context = { ...siteData, ...dependencyData, page: pageData };

    // 5. Initialize the engine and render the template.
    const engine = new Liquid({
      ...liquidConfig,
      globals: context,
      fs: liquidFs,
    });

    let rendered;
    try {
      rendered = await engine.parseAndRender(body, context);
    } catch (error) {
      // Throw a diagnostic error for Parcel to display.
      throw new ThrowableError({
        error,
        codeFrames: [
          {
            filePath: asset.filePath,
            code: code,
            // LiquidJS errors often have line numbers. A more robust implementation
            // would parse error.message to extract the line and column.
          },
        ],
      });
    }

    asset.setCode(rendered);
    if (asset.type === "liquid") {
      asset.type = "html";
    }
    return [asset];
  },
});
