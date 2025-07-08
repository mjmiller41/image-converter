# Project: Image Converter Web App

This project is a web application for converting images, built using Parcel.js and
Node.js.

## General Instructions:

- When generating new code, please follow the existing coding style.
- Ensure all new JavaScript functions have JSDoc comments.
- All code should be compatible with Node.js 18+ and modern web browsers.

## Tech Stack:

- **Bundler:** Parcel.js
- **Templating:** LiquidJS, using the custom `packages/parcel-transformer-liquid-fm` to
  process files with front matter.
- **Styling:** Plain CSS
- **Scripting:** Vanilla JavaScript (ES6+)

## Coding Style:

- **Indentation:** Use 2 spaces.
- **JavaScript:**
  - Private class members should be prefixed with an underscore (`_`).
  - Always use strict equality (`===` and `!==`).
  - Prefer asynchronous operations (`async/await`, `Promises`) over synchronous ones,
    especially for file I/O, to avoid blocking.
  - Decompose large functions into smaller, single-responsibility functions to improve
    readability and maintainability.
- **HTML/Liquid:**
  - Use the `{% layout %}` tag for assigning layouts, not front matter.
  - Use the `{% render %}` tag instead of `{% include %}`.
- **CSS/SASS:**
  - All new styles should be added to the appropriate partial in the `_sass` directory.
  - Global/sitewide styles, variables, and mixins should be integrated into the
    appropriate file in `_sass`.

## Development Workflow:

- **Run dev server:** `npm start`
- **Build for production:** `npm run build`
- **Deployment:** The project is deployed to GitHub Pages using the `gh-pages` npm
  package.

## Regarding Dependencies:

- Avoid introducing new external dependencies unless absolutely necessary.
- If a new dependency is required, please state the reason clearly.

## Documentation:

- **LiquidJS**: https://liquidjs.com/
- **Parcel**: https://parceljs.org/
- **Node.js**: https://nodejs.org/en/docs/
- **JavaScript (MDN)**: https://developer.mozilla.org/en-US/docs/Web/JavaScript
- **HTML (MDN)**: https://developer.mozilla.org/en-US/docs/Web/HTML
- **CSS (MDN)**: https://developer.mozilla.org/en-US/docs/Web/CSS
- **Markdown Guide**: https://www.markdownguide.org/
- **Jekyll**: https://jekyllrb.com/docs/
