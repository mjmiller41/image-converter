const fs = require("fs/promises");
const path = require("path");
const { glob } = require("glob");
const fm = require("front-matter");
const pkg = require("../../package.json");
const Page = require("./page");

/**
 * Sorts a collection of objects by a 'date' property.
 * @param {Array<object>} collection - The array of objects to sort. Each object must have a 'date' property.
 * @param {'asc' | 'desc'} [direction='asc'] - The sort direction.
 * @returns {Array<object>} The sorted collection.
 */
function sortCollectionByDate(collection, direction = "asc") {
  return collection.sort((a, b) => {
    const aDate = new Date(a.date);
    const bDate = new Date(b.date);
    if (direction === "asc") return aDate - bDate;
    if (direction === "desc") return bDate - aDate;
  });
}

/**
 * Checks if an item is a plain object (and not an array or null).
 * @param {*} item The item to check.
 * @returns {boolean} True if the item is a plain object.
 */
const isObject = (item) => {
  return item && typeof item === "object" && !Array.isArray(item);
};

/**
 * Deeply merges two objects. Properties from the source object override those
 * in the target object. If a key exists in both and the values are arrays,
 * they are concatenated with unique values.
 *
 * @param {object} target The base object.
 * @param {object} source The object with properties to merge and override.
 * @returns {object} A new object representing the merged result.
 */
function deepMerge(target, source) {
  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      const targetValue = target[key];
      const sourceValue = source[key];

      if (isObject(sourceValue) && isObject(targetValue)) {
        output[key] = deepMerge(targetValue, sourceValue);
      } else if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
        output[key] = [...new Set([...targetValue, ...sourceValue])];
      } else {
        output[key] = sourceValue;
      }
    });
  }

  return output;
}

/**
 * Combines exclude and include patterns for use with glob's ignore option.
 * It creates a new array where include patterns are negated (prefixed with '!')
 * and appended to the exclude list. This allows included files to override
 * broader exclusion rules, which is the standard glob behavior.
 *
 * @param {string[] | undefined} [exclude] - An array of glob patterns to exclude.
 * @param {string[] | undefined} [include] - An array of glob patterns to re-include.
 * @returns {string[]} A new array of patterns for glob's ignore option.
 */
function resolveExcludes(exclude, include) {
  const excludePatterns = Array.isArray(exclude) ? exclude : [];
  const includePatterns = Array.isArray(include) ? include : [];

  if (includePatterns.length === 0) {
    return [...excludePatterns];
  }

  const negatedIncludes = includePatterns.map((pattern) => `!${pattern}`);
  return [...excludePatterns, ...negatedIncludes];
}

/**
 * Loads and merges default and user configurations from files.
 * @param {import('@parcel/types').PluginOptions} config - The Parcel configuration object.
 * @returns {Promise<object>} The merged site configuration.
 */
async function loadSiteConfig(config) {
  // Load default config
  const defaultCfgFile = "packages/parcel-transformer-liquid-fm/configDefaults.json";
  let { contents: defaultContents, filepath: defaultFilepath } = await config.getConfig(
    [defaultCfgFile],
    { encoding: "utf8" }
  );
  config.invalidateOnFileChange(defaultFilepath);

  let siteCfg = { ...defaultContents };

  // Load user config
  const userCfgFile = pkg.hydejs?.configFile || siteCfg.configFile || "config.json";
  const { contents: userContents, filepath: userFilepath } = await config.getConfig(
    [userCfgFile],
    { encoding: "utf8" }
  );

  if (userContents) {
    config.invalidateOnFileChange(userFilepath);
    siteCfg = deepMerge(siteCfg, userContents);
  }

  return siteCfg;
}

/**
 * Processes all collections, reads their files, creates Page objects,
 * sorts them, and links them for pagination.
 * @param {object} siteCfg - The site configuration.
 * @param {string} projRoot - The project root directory.
 * @param {import('@parcel/types').PluginOptions} config - The Parcel configuration object.
 * @returns {Promise<void>}
 */
async function processCollections(siteCfg, projRoot, config) {
  if (!siteCfg.collections) {
    return;
  }

  // Process all collections in parallel for better performance.
  await Promise.all(
    Object.entries(siteCfg.collections).map(
      async ([collectionName, collectionConfig]) => {
        const collectionPath = path.join(projRoot, `${collectionName}`);

        // glob handles non-existent paths gracefully by returning an empty array.
        const files = await glob(`${collectionPath}/**/*.*`);
        if (files.length === 0) {
          return; // No files in collection, skip.
        }

        files.forEach((file) => config.invalidateOnFileChange(file));

        // Read and process all files in the collection in parallel.
        const collectionItems = await Promise.all(
          files.map(async (filepath) => {
            const content = await fs.readFile(filepath, "utf8");
            const { attributes, body } = fm(content);

            if (collectionConfig.output || attributes.output) {
              const fileData = {
                ...siteCfg,
                ...collectionConfig,
                ...attributes,
                content: body || "",
                collection: collectionName,
                filepath,
              };
              return new Page(fileData);
            }
            return undefined;
          })
        );

        const filteredItems = collectionItems.filter(Boolean);
        siteCfg[collectionName] = sortCollectionByDate(filteredItems);

        // Assign next & previous post/page
        if (siteCfg[collectionName]?.[0] instanceof Page) {
          const collection = siteCfg[collectionName];
          collection.forEach((page, i) => {
            page.next = collection[i + 1] || null;
            page.previous = collection[i - 1] || null;
          });
        }
      }
    )
  );
}

/**
 * Gathers all site-wide data, including configuration and collections.
 * This function serves as the main data aggregator for the transformer.
 * @param {import('@parcel/types').PluginOptions} config - The Parcel plugin options object.
 * @returns {Promise<{site: object}>} A promise that resolves to the global data object.
 */
module.exports = async function globalData(config) {
  const siteCfg = await loadSiteConfig(config);
  const projRoot = process.cwd();

  await processCollections(siteCfg, projRoot, config);

  const globalData = { site: siteCfg };

  return globalData;
};
