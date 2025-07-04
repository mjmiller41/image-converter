const {
  Tag,
  Hash,
  ForloopDrop,
  isString,
  isValueToken,
  toEnumerable,
  TypeGuards,
  Tokenizer,
  assert,
  evalQuotedToken,
  evalToken,
} = require("liquidjs");

function optimize(templates) {
  if (templates.length === 1 && TypeGuards.isHTMLToken(templates[0].token))
    return templates[0].token.getContent();
  return templates;
}

function* renderFilePath(file, ctx, liquid) {
  if (typeof file === "string") return file;
  if (Array.isArray(file)) return liquid.renderer.renderTemplates(file, ctx);
  return yield evalToken(file, ctx);
}

function parseFilePath(tokenizer, liquid, parser) {
  if (liquid.options.dynamicPartials) {
    const file = tokenizer.readValue();
    tokenizer.assert(file, "illegal file path");
    if (file.getText() === "none") return;
    if (TypeGuards.isQuotedToken(file)) {
      const templates = parser.parse(evalQuotedToken(file));
      return optimize(templates);
    }
    return file;
  }
  const tokens = [...tokenizer.readFileNameTemplate(liquid.options)];
  const templates = optimize(parser.parseTokens(tokens));
  return templates === "none" ? undefined : templates;
}

module.exports = class extends Tag {
  constructor(token, remainTokens, liquid, parser) {
    super(token, remainTokens, liquid);
    const tokenizer = this.tokenizer;
    this.file = parseFilePath(tokenizer, this.liquid, parser);
    this.currentFile = token.file;
    while (!tokenizer.end()) {
      tokenizer.skipBlank();
      const begin = tokenizer.p;
      const keyword = tokenizer.readIdentifier();
      if (keyword.content === "with" || keyword.content === "for") {
        tokenizer.skipBlank();
        if (tokenizer.peek() !== ":") {
          const value = tokenizer.readValue();
          if (value) {
            const beforeAs = tokenizer.p;
            const asStr = tokenizer.readIdentifier();
            let alias;
            if (asStr.content === "as") alias = tokenizer.readIdentifier();
            else tokenizer.p = beforeAs;

            this[keyword.content] = { value, alias: alias && alias.content };
            tokenizer.skipBlank();
            if (tokenizer.peek() === ",") tokenizer.advance();
            continue;
          }
        }
      }
      tokenizer.p = begin;
      break;
    }
    this.hash = new Hash(tokenizer, liquid.options.keyValueSeparator);
  }

  *render(ctx, emitter) {
    const { liquid, hash } = this;
    const filepath = yield renderFilePath(this["file"], ctx, liquid);
    assert(filepath, () => `illegal file path "${filepath}"`);

    const childCtx = ctx.spawn();
    const scope = childCtx.bottom();
    Object.assign(scope, yield hash.render(ctx));
    if (this["with"]) {
      const { value, alias } = this["with"];
      scope[alias || filepath] = yield evalToken(value, ctx);
    }

    if (this["for"]) {
      const { value, alias } = this["for"];
      const collection = toEnumerable(yield evalToken(value, ctx));
      scope["forloop"] = new ForloopDrop(
        collection.length,
        value.getText(),
        alias
      );
      for (const item of collection) {
        scope[alias] = item;
        const templates = yield liquid._parsePartialFile(
          filepath,
          childCtx.sync,
          this["currentFile"]
        );
        yield liquid.renderer.renderTemplates(templates, childCtx, emitter);
        scope["forloop"].next();
      }
    } else {
      console.log(`filepath: ${filepath}`);
      console.log(`currentFile: ${this["currentFile"]}`);
      // console.log(`ctx: ${JSON.stringify(childCtx, null, 2)}`);
      // console.log(`ctx: ${JSON.stringify(childCtx.globals, null, 2)}`);
      const templates = yield liquid._parsePartialFile(
        filepath,
        childCtx.sync,
        this["currentFile"]
      );
      yield liquid.renderer.renderTemplates(templates, childCtx, emitter);
    }
  }

  *children(partials, sync) {
    if (partials && isString(this["file"])) {
      return yield this.liquid._parsePartialFile(
        this["file"],
        sync,
        this["currentFile"]
      );
    }
    return [];
  }

  partialScope() {
    if (isString(this["file"])) {
      const names = Object.keys(this.hash.hash);

      if (this["with"]) {
        const { value, alias } = this["with"];
        if (isString(alias)) {
          names.push([alias, value]);
        } else if (isString(this.file)) {
          names.push([this.file, value]);
        }
      }

      if (this["for"]) {
        const { value, alias } = this["for"];
        if (isString(alias)) {
          names.push([alias, value]);
        } else if (isString(this.file)) {
          names.push([this.file, value]);
        }
      }

      return { name: this["file"], isolated: true, scope: names };
    }
  }

  *arguments() {
    for (const v of Object.values(this.hash.hash)) {
      if (isValueToken(v)) {
        yield v;
      }
    }

    if (this["with"]) {
      const { value } = this["with"];
      if (isValueToken(value)) {
        yield value;
      }
    }

    if (this["for"]) {
      const { value } = this["for"];
      if (isValueToken(value)) {
        yield value;
      }
    }
  }
};
