const { Transformer } = require("@parcel/plugin");
const { Liquid } = require("liquidjs");
const fm = require("front-matter");
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");
const glob = require("glob");
const LiquidFS = require("./liquidFS");

module.exports = new Transformer({
  async loadConfig({ config }) {
    const liquidConfig = await config.getConfig([".liquidrc", ".liquidrc.js"], {
      packageKey: "liquid",
    });
    if (liquidConfig) {
      config.invalidateOnFileChange(liquidConfig.filePath);
      return liquidConfig.contents;
    }
    return {};
  },
  async transform({ asset, config }) {
    const projectRoot = process.cwd();
    const extname = config.extname;
    const lytRegx = /{%[-]*\s*layout\s+['"]([^'"]+)['"]/;
    const rndrRegx = /{%[-]*\s*render\s+['"]([^'"]+)['"]/g;
    const layoutDirs = Array.isArray(config.layouts)
      ? config.layouts
      : [config.layouts];
    const partialDirs = Array.isArray(config.partials)
      ? config.partials
      : [config.partials];
    // const fileKey = getKey(asset.filePath);

    // const fileKey = getKey(asset.filePath);

    let content = await asset.getCode();
    let templates = {};
    let context = {};

    // const liquidFS = createParcelLiquidFS(asset, config, globalData);

    // engine.registerTag("render", RenderWithFrontMatter);

    // Extract global/site data
    const globalData = await getGlobalData(asset, projectRoot);
    context.site = globalData;

    // Extract file data
    const { body, attributes } = fm(content);
    // content = body;
    context.page = attributes;
    // templates[fileKey] = body;

    const liquidFs = LiquidFS(asset, context, config);

    // Extract layout data
    if (body.match(lytRegx)) await extractLayoutData(body);

    // Extract partial data
    if (body.match(rndrRegx)) await extractPartialsData(body);

    const engine = new Liquid({
      ...config,
      globals: context,
      fs: liquidFs,
    });

    let rendered = "";
    const filename = asset.filePath.split("/").slice(-1)[0];
    try {
      rendered = await engine.parseAndRender(body, context);
    } catch (error) {
      console.log(error);
    }

    asset.setCode(rendered);
    if (asset.type === "liquid") asset.type = "html";
    return [asset];

    function getKey(filepath) {
      return filepath.split("/").slice(-2).join("/");
    }

    async function extractLayoutData(content) {
      const match = content.match(lytRegx);
      if (match) {
        const filename = match[1];
        let filepath = "";
        for (const dir of layoutDirs) {
          filepath = liquidFs.resolve(dir, filename, extname);
          if (liquidFs.existsSync(filepath)) break;
        }
        if (filepath) {
          asset.invalidateOnFileChange(filepath);
          const fileData = liquidFs.readFileSync(filepath, "utf8");
          const { attributes, body } = fm(fileData);
          context.layout = { ...context.layout, ...attributes };
          templates[getKey(filepath)] = body;
          await extractPartialsData(body);
          if (body.match(lytRegx)) extractLayoutData(body);
        } else {
          throw new Error(`Layout file not found: ${filename}`);
        }
      }
    }

    async function extractPartialsData(content) {
      const matches = await content.matchAll(rndrRegx);
      for (let match of matches) {
        const filename = match[1];
        let filepath = "";
        for (const dir of partialDirs) {
          filepath = liquidFs.resolve(dir, filename, extname);
          if (liquidFs.existsSync(filepath)) break;
        }
        if (liquidFs.existsSync(filepath)) {
          asset.invalidateOnFileChange(filepath);
          const partialContent = liquidFs.readFileSync(filepath, "utf8");
          const { attributes, body } = fm(partialContent);
          context = { ...context, ...attributes };
          templates[getKey(filepath)] = body;
          if (body.match(rndrRegx)) await extractPartialsData(body);
        }
      }
    }

    async function getGlobalData(asset, projectRoot) {
      const globalData = {};

      // Extract site data
      const configPath = path.join(projectRoot, "_config.yml");
      if (fs.existsSync(configPath)) {
        asset.invalidateOnFileChange(configPath);
        const configContent = fs.readFileSync(configPath, "utf8");
        globalData.site = yaml.load(configContent);
      }

      // Extract collections data
      if (globalData.site?.collections) {
        for (const [collectionName, collectionConfig] of Object.entries(
          globalData.site.collections
        )) {
          const collectionPath = path.join(projectRoot, `_${collectionName}`);
          if (!fs.existsSync(collectionPath)) continue;

          const files = glob.sync(`${collectionPath}/**/*.*`);
          files.forEach((file) => asset.invalidateOnFileChange(file));

          globalData.site[collectionName] = files.map((filePath) => {
            const content = fs.readFileSync(filePath, "utf8");
            const { attributes, body } = fm(content);
            let url = attributes.permalink || "";
            if (
              collectionConfig.output &&
              collectionConfig.permalink &&
              !attributes.permalink
            ) {
              url = collectionConfig.permalink.replace(
                /:title/g,
                path.basename(filePath, path.extname(filePath))
              );
            }
            return { ...attributes, content: body, url };
          });
        }
      }

      return globalData;
    }
  },
});
