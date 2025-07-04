const path = require("path");
const fs = require("fs");
const fm = require("front-matter");
const { Liquid } = require("liquidjs");

function promisify(fn) {
  return function (...args) {
    return new Promise((resolve, reject) => {
      fn(...args, (err, result) => {
        err ? reject(err) : resolve(result);
      });
    });
  };
}
const statAsync = promisify(fs.stat);

module.exports = function (asset, context, config) {
  const engine = new Liquid(config);
  return {
    readFileSync(filepath, encoding = "utf-8") {
      const file = fs.readFileSync(filepath, encoding);
      const { attributes, body } = fm(file);
      const scope = { ...context, ...attributes };
      return body;
    },
    // Asynchronous read.
    async readFile(filepath, encoding = "utf-8") {
      const file = await fs.promises.readFile(filepath, { encoding });
      const { attributes, body } = fm(file);
      const scope = { ...context, ...attributes };
      return body;
    },
    async exists(filepath) {
      try {
        await statAsync(filepath);
        return true;
      } catch (err) {
        return false;
      }
    },
    existsSync(filepath) {
      try {
        fs.statSync(filepath);
        return true;
      } catch (err) {
        return false;
      }
    },
    resolve(root, file, ext) {
      if (!path.extname(file)) file += ext;
      return path.resolve(root, file);
    },
    dirname(filepath) {
      return path.dirname(filepath);
    },
    contains(root, file) {
      root = path.resolve(root);
      root = root.endsWith(path.sep) ? root : root + path.sep;
      return file.startsWith(root);
    },
  };
};
