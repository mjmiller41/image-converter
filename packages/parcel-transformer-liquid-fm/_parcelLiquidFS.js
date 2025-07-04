const fs = require("fs");
const path = require("path");
const fm = require("front-matter");
const { Liquid } = require("liquidjs");

/**
 * Creates a custom LiquidJS Filesystem object that hooks into Parcel's dependency tracking.
 * @param {Asset} asset The Parcel asset being transformed.
 * @param {string} projectRoot The root directory of the project.
 * @returns {object} A LiquidJS-compatible filesystem object.
 */
function createParcelLiquidFS(asset, config, scope) {
  const rootDirs = Array.isArray(config.root) ? config.root : [config.root];
  const layoutDirs = Array.isArray(config.layouts)
    ? config.layouts
    : [config.layouts];
  const partialDirs = Array.isArray(config.partials)
    ? config.partials
    : [config.partials];
  const roots = [...rootDirs, ...layoutDirs, ...partialDirs];

  // This object implements the LiquidJS fs interface.
  // We spread the native `fs` module to ensure all methods are present,
  // then override the ones we need to intercept for dependency tracking.
  const fsObj = {
    // Synchronous read, used by `include` and `layout` tags.
    readFileSync(filepath, encoding = "utf-8") {
      asset.invalidateOnFileChange(filepath);
      const file = fs.readFileSync(filepath, encoding);
      if (fm.test(file)) {
        const { attributes, body } = fm(file);
        scope = { ...scope, ...attributes };
        return engine.parseAndRenderSync(body, scope);
      }
      return file;
    },

    // Asynchronous read.
    async readFile(filepath, encoding = "utf-8") {
      asset.invalidateOnFileChange(filepath);
      const file = await fs.promises.readFile(filepath, { encoding });
      if (fm.test(file)) {
        const { attributes, body } = fm(file);
        scope = { ...scope, ...attributes };
        console.log("\n".repeat(5), `filepath: ${filepath}`);
        console.log(`scope: ${scope}`);
        console.log(`body: ${body}`);
        const html = await engine.parseAndRender(body, scope);
        console.log(`html: ${html}`);
        return html;
      }
      return file;
    },

    existsSync(filepath) {
      return fs.existsSync(filepath);
    },

    async exists(filepath) {
      return await fs.promises
        .access(filepath)
        .then(() => true)
        .catch(() => false);
    },

    // Used by LiquidJS to check if it should even try to load a template.
    contains: (root, file) => {
      root = path.resolve(root);
      root = root.endsWith(path.sep) ? root : root + path.sep;
      return file.startsWith(root);
    },

    resolve(root, file, ext) {
      if (!path.extname(file)) file += ext;
      return path.resolve(root, file);
    },
  };
  const engine = new Liquid({ ...config, fs: fsObj });
  return fsObj;
}

module.exports = { createParcelLiquidFS };
