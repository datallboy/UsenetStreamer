# JSDoc HTML Generation

This project is set up to generate browsable JSDoc HTML output.

## Prerequisite

Install JSDoc as a dev dependency:

```bash
npm i -D jsdoc
```

## Generate HTML

```bash
npm run docs:jsdoc
```

Output is written to:

`docs/jsdoc`

Main entry file:

`docs/jsdoc/index.html`

## Notes

- Source selection is configured in `jsdoc.json`.
- Current config scans `src/**/*.js`.
- Files that use TypeScript-only JSDoc type imports are excluded from HTML generation for now:
  - `server.js`
  - `src/utils/helpers.js`
  - `src/utils/templateEngine.js`
  - `src/services/metadata/releaseParser.js`
- Parser vendor files and tests are excluded to keep output focused.
- These exclusions avoid JSDoc parser errors while preserving `tsc --checkJs` typing in code.
