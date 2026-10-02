/**
 * The plain pages' styles, close to index.html's fallback page and in the app's colours, written as hex for browsers
 * without oklch, custom properties or the newer selectors. Each page carries them inline, so it needs no other request.
 */
export const STYLE = `
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body {
  margin: 0;
  background: #fcfcfa;
  color: #1e2b2b;
  font-family: "Atkinson Hyperlegible Next", "Atkinson Hyperlegible", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  word-wrap: break-word;
  overflow-wrap: break-word;
}
.page { max-width: 36rem; margin: 0 auto; padding: 0 1rem 2rem; }
header { padding: 1rem 0 0.75rem; border-bottom: 1px solid #dfe5e3; }
h1 { font-size: 1.75rem; line-height: 1.25; margin: 1.5rem 0 1rem; }
h2 { font-size: 1.375rem; line-height: 1.3; margin: 2rem 0 0.75rem; }
h3 { font-size: 1.125rem; line-height: 1.3; margin: 1.5rem 0 0.5rem; }
p, ul, ol { margin: 0 0 1rem; }
a { color: #355f5b; }
a[href^="tel:"], a[href^="sms:"] { white-space: nowrap; }
:focus { outline: 3px solid #355f5b; outline-offset: 2px; }
.vh {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  margin: -1px !important;
  padding: 0 !important;
  overflow: hidden !important;
  clip: rect(0 0 0 0) !important;
  border: 0 !important;
  white-space: nowrap !important;
}
.hint, .meta { color: #5b6b69; }
.hint { margin: 0 0 0.5rem; }
.meta { margin: 0 0 0.25rem; }
.field { margin: 0 0 1.25rem; }
.field label { display: block; margin: 0 0 0.25rem; font-weight: bold; }
input[type="text"] {
  box-sizing: border-box;
  width: 100%;
  max-width: 24rem;
  margin: 0;
  padding: 0.5rem;
  border: 2px solid #5b6b69;
  border-radius: 4px;
  background: #fff;
  color: #1e2b2b;
  font: inherit;
}
input[aria-invalid="true"] { border-color: #b42318; }
fieldset { min-width: 0; margin: 0 0 1.25rem; padding: 0; border: 0; }
legend { padding: 0; margin: 0 0 0.5rem; font-weight: bold; }
.choice, .check { margin: 0 0 0.375rem; }
.choice input, .check input { width: 1.25rem; height: 1.25rem; margin: 0 0.5rem 0 0; vertical-align: middle; }
.choice label, .check label { vertical-align: middle; }
.choice .hint { margin: 0.25rem 0 0 1.75rem; }
details { border-top: 1px solid #dfe5e3; }
details:last-of-type { border-bottom: 1px solid #dfe5e3; margin-bottom: 1.25rem; }
summary { padding: 0.625rem 0; font-weight: bold; cursor: pointer; }
details fieldset { margin: 0.25rem 0 1rem; }
.section { margin: 1rem 0 0; }
.section legend { margin: 0 0 0.375rem; }
button {
  margin: 0;
  padding: 0.625rem 1.25rem;
  border: 2px solid #355f5b;
  border-radius: 4px;
  background: #355f5b;
  color: #fff;
  font: inherit;
  font-weight: bold;
  cursor: pointer;
}
button.secondary { background: transparent; color: #355f5b; }
.problem { margin: 0 0 1.5rem; padding: 1rem; border: 3px solid #b42318; }
.problem h2 { margin: 0 0 0.5rem; }
.problem ul { margin: 0; }
.error { margin: 0 0 0.5rem; color: #b42318; font-weight: bold; }
.results { margin: 0 0 1.5rem; padding: 0; list-style: none; }
.results > li { padding: 1rem 0; border-top: 1px solid #dfe5e3; }
.results h2 { margin: 0 0 0.25rem; }
.results p { margin: 0 0 0.5rem; }
footer { margin-top: 2.5rem; padding-top: 1rem; border-top: 1px solid #dfe5e3; }
@media (prefers-color-scheme: dark) {
  body { background: #141b1b; color: #e8eeec; }
  a { color: #8db8b2; }
  :focus { outline-color: #8db8b2; }
  header, details, details:last-of-type, .results > li, footer { border-color: #33403f; }
  .hint, .meta { color: #9aaba8; }
  input[type="text"] { border-color: #9aaba8; background: #1b2524; color: #e8eeec; }
  input[aria-invalid="true"] { border-color: #ff6467; }
  button { border-color: #8db8b2; background: #8db8b2; color: #0f1a19; }
  button.secondary { background: transparent; color: #8db8b2; }
  .problem { border-color: #ff6467; }
  .error { color: #ff6467; }
}
`;
