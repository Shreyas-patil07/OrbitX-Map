import prefixer from 'postcss-prefix-selector'

// Scope the Rasuwa map's stylesheet under .rasuwa-app so its generic selectors
// (body, buttons, .hidden ...) cannot leak into the OrbitX landing page.
export default {
  plugins: [
    prefixer({
      prefix: '.rasuwa-app',
      includeFiles: [/rasuwa\.css$/],
      transform(prefix, selector, prefixed) {
        return selector === 'html' || selector === 'body' ? prefix : prefixed
      },
    }),
  ],
}
