const { Tag, Tokenizer, evalToken, Hash } = require("liquidjs");
const fm = require("front-matter");

// This is a custom implementation of the Render tag that adds support for front-matter.
module.exports = class RenderWithFrontMatter extends Tag {
  constructor(token, remainTokens, liquid) {
    super(token, remainTokens, liquid);
    const tokenizer = new Tokenizer(token.args, this.liquid.options.operators);

    this.file = tokenizer.readValue();

    tokenizer.skipBlank();
    if (tokenizer.peek() === ",") {
      tokenizer.advance();
    }
    this.args = tokenizer.readHashes();
  }

  *render(ctx) {
    const { liquid, args } = this;

    // Use `evalToken` to correctly evaluate the raw file path token.
    const file = yield evalToken(this.file, ctx);

    // Use the high-level liquid.resolve() to find the file in all configured roots.
    let filepath
    const partials = liquid.options.partials.find(p=>{
      filepath = yield liquid.resolve(String(p), String(file));
    })

    // Use the engine's custom FS to read the file, which ensures Parcel tracks the dependency.

    const source = liquid.options.fs.readFileSync(filepath, "utf-8");
    const { attributes, body } = fm(source);

    // Create a new scope for the partial, including its own front matter and any passed arguments.
    const scope = { ...attributes };
    for (const hash of args) {
      scope[hash.name.content] = evalToken(hash.value, ctx);
    }

    const tpls = liquid.parse(body);
    ctx.push(scope);
    const html = yield liquid.renderer.renderTemplates(tpls, ctx);
    ctx.pop();
    return html;
  }
};
