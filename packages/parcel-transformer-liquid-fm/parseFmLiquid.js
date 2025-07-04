const { Liquid } = require("liquidjs");
const fm = require("front-matter");
const path = require("path");
const fs = require("fs");
const yaml = require("js-yaml");

module.exports = async function parseFmLiquid(content) {
  const engine = new Liquid(config);

  // const content = await asset.getCode();
  const { body, attributes } = fm(content);

  const rendered = await engine.parseAndRender(body, {
    page: attributes,
    site: await getGlobalData(),
  });
};
