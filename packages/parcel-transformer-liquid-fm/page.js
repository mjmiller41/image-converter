const path = require("path");
const slugify = require("slugify");
const unslug = require("unslug");

/**
 * A simple implementation of startCase to avoid the lodash dependency.
 * Converts a string to start case (e.g., 'hello world' -> 'Hello World').
 * @param {string} str The string to convert.
 * @returns {string}
 */
function startCase(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Represents a single page or document in the site.
 * It processes a configuration object to extract and compute various properties
 * like URL, title, date, etc., which are then available for use in templates.
 * @class
 */
module.exports = class Page {
  #permalinkRegx = /:([a-zA-Z_]+)/g;
  #dateRegx = /\d{4}-\d{2}-\d{2}/;

  /**
   * Creates an instance of a Page.
   * @param {object} config - The configuration object for the page, typically derived from front matter and global site settings.
   * @param {string} config.content - The raw content of the page (body).
   * @param {string} config.filepath - The absolute path to the source file.
   * @param {string} [config.title] - The title from front matter.
   * @param {string} [config.excerpt] - The excerpt from front matter.
   * @param {string} [config.permalink] - The permalink pattern to generate the URL.
   * @param {Date|string} [config.date] - The date from front matter.
   * @param {string[]} [config.categories] - A list of categories.
   * @param {string} [config.collection] - The name of the collection this page belongs to.
   * @param {string[]} [config.tags] - A list of tags.
   * @param {string} [config.excerpt_separator] - The separator to use for manual excerpts.
   * @param {number} [config.excerpt_length] - The character length for automatic excerpts.
   */
  constructor(config) {
    /** @property {string} content - The raw, unprocessed content of the page. */
    this.content = config.content || "";
    /** @property {string} title - The title of the page. */
    this.title = config.title ? config.title : this.#extractTitle(config);
    /** @property {string} excerpt - A short summary of the page content. */
    this.excerpt = config.excerpt ? config.excerpt : this.#extractExcerpt(config);
    /** @property {string} url - The final, permalink-generated URL of the page. */
    this.url = this.#extractUrl(config);
    /** @property {string} permalink - An alias for the URL. */
    this.permalink = this.url || "";
    /** @property {Date} date - The publication date of the page. */
    this.date = this.#extractDate(config);
    /** @property {string} id - A unique identifier for the page. */
    this.id = this.#extractId(config);
    /** @property {string[]} categories - A list of categories the page belongs to. */
    this.categories = config.categories || [];
    /** @property {string} collection - The collection the page belongs to. */
    this.collection = config.collection || "";
    /** @property {string[]} tags - A list of tags associated with the page. */
    this.tags = config.tags || [];
    /** @property {string} dir - The source directory of the page file, relative to the project root. */
    this.dir = this.#extractDir(config);
    /** @property {string} name - The full filename (e.g., 'post.md'). */
    this.name = this.#splitFilepath(config.filepath).filename || "";
    /** @property {string} path - The full, absolute path to the source file. */
    this.path = config.filepath || "";
    /** @property {string} slug - The slugified version of the page's name. */
    this.slug = slugify(this.name) || "";
    /** @property {string} ext - The file extension (e.g., '.md'). */
    this.ext = this.#splitFilepath(config.filepath).ext || "";
    /** @property {Page|undefined} next - A reference to the next page in the collection. */
    this.next = undefined;
    /** @property {Page|undefined} previous - A reference to the previous page in the collection. */
    this.previous = undefined;
  }

  /**
   * Extracts the title for the page. If not provided in front matter,
   * it generates a title from the filename.
   * @private
   * @param {object} config - The page configuration object.
   * @returns {string} The extracted or generated title.
   */
  #extractTitle(config) {
    // Fallback to generating a title from the filename if not provided in front matter.
    const filepathWithoutDate = config.filepath.replace(this.#dateRegx, "");
    const basename = this.#splitFilepath(filepathWithoutDate).basename;
    const title = startCase(unslug(basename));
    return title;
  }

  /**
   * Extracts an excerpt from the page content. It prioritizes a manual
   * separator, then a character length, falling back to a default length.
   * @private
   * @param {object} config - The page configuration object.
   * @param {string} config.content - The content to extract from.
   * @returns {string} The generated excerpt.
   */
  #extractExcerpt(config) {
    if (!this.content) return "";
    const excerpt_separator = config.excerpt_separator;
    const excerpt_length = config.excerpt_length;
    if (excerpt_separator && this.content.includes(excerpt_separator)) {
      return this.content.split(excerpt_separator)[0];
    } else if (excerpt_length && excerpt_length > 0) {
      return this.content.slice(0, excerpt_length) + "...";
    } else {
      return this.content.slice(0, 200) + "...";
    }
  }

  /**
   * Extracts the date for the page. It prioritizes the date from front matter,
   * falling back to parsing a date from the filename (e.g., 'YYYY-MM-DD').
   * @private
   * @param {object} config - The page configuration object.
   * @param {string} config.filepath - The path to the source file.
   * @returns {Date|string} The extracted Date object, or an empty string if none is found.
   */
  #extractDate(config) {
    let dateStr = config.date;
    if (!dateStr) {
      const match = config.filepath.match(this.#dateRegx);
      if (match) dateStr = match[0];
      else return "";
    }
    const date = new Date(dateStr); //.toLocaleString("en-US", {
    //   dateStyle: "full",
    //   timeStyle: "short",
    // });
    return date;
  }

  /**
   * Generates the page URL by replacing placeholders in a permalink pattern
   * (e.g., '/:collection/:title/') with corresponding values from the page data.
   * @private
   * @param {object} config - The page configuration object.
   * @returns {string} The generated URL.
   */
  #extractUrl(config) {
    const permalink = config.permalink;
    // If no permalink pattern is defined, there's nothing to do.
    if (!permalink) return "";

    // The 'replace' method with a global regex and a replacer function
    // will iterate through all matches and build the new string correctly.
    return permalink.replace(this.#permalinkRegx, (match, placeholder) => {
      let value = config[placeholder];

      // If the placeholder is 'title' and it's not in the front matter,
      // we must derive it from the filename, just as the constructor does.
      if (placeholder === "title" && !value) {
        value = this.#extractTitle(config);
      }

      if (value) {
        // Handle array values like 'categories' by taking the first one.
        const valueToSlugify = Array.isArray(value) ? value[0] : value;
        return slugify(String(valueToSlugify), { lower: true, strict: true });
      }

      // If the placeholder value is not found, leave it in the URL.
      // This makes it easier to debug missing data.
      return match;
    });
  }

  /**
   * Generates a unique ID for the page, typically used for linking.
   * The ID is based on the page's date and title.
   * @private
   * @param {object} config - The page configuration object.
   * @returns {string} The unique page ID.
   */
  #extractId(config) {
    let id = "/";
    let { filename, basename, ext, dir } = this.#splitFilepath(config.filepath);
    const match = basename.match(this.#dateRegx);
    if (match) {
      id += `${match[0].split("-").join("/")}/`;
    } else if (config.collection) {
      id += `${config.collection}/`;
    }
    // Remove leading hyphens that might be left after removing the date.
    const slug = filename.replace(this.#dateRegx, "").replace(/^-+/, "");
    return (id += `${slug}/`);
  }

  /**
   * Extracts the directory path of the file, relative to the project root.
   * @private
   * @param {object} config - The page configuration object.
   * @param {string} config.filepath - The path to the source file.
   * @returns {string} The relative directory path, ending with a slash.
   */
  #extractDir(config) {
    let dir;
    dir = this.#splitFilepath(config.filepath).dir;
    // console.log(config.filepath);
    dir = dir.replace(process.cwd(), "");
    return (dir += "/");
  }

  /**
   * Splits a filepath into its constituent parts.
   * @private
   * @param {string} filepath - The filepath to split.
   * @returns {{dir: string, filename: string, basename: string, ext: string}}
   * An object containing the directory, full filename, basename, and extension.
   */
  #splitFilepath(filepath) {
    const dir = path.dirname(filepath);
    const filename = path.basename(filepath);
    const basename = path.basename(filepath, path.extname(filepath));
    const ext = path.extname(filepath);
    return { dir, filename, basename, ext };
  }
};
