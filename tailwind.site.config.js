/**
 * Tailwind config for the marketing site's stylesheet (src/site.css): the
 * full config, scanning only the code the marketing site renders, so the
 * stylesheet inlined into every page carries none of the tracker's classes.
 * The app.* and reporter.* hosts add the full stylesheet (src/app/app.css).
 */
import config from './tailwind.config.js';

export default {
  ...config,
  content: [
    './index.html',
    './src/main.jsx',
    './src/main/**/*.{js,ts,jsx,tsx}',
    './src/shared/**/*.{js,ts,jsx,tsx}',
  ],
};
