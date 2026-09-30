import type { HtmlTagDescriptor, Plugin } from "vite";

/** The Latin sets among the built files; the extended and other scripts' sets load for the few names that need them. */
export function latinFonts(fileNames: string[]): string[] {
  return fileNames.filter((name) => /-latin-(?!ext-)[\w-]*\.woff2$/.test(name));
}

/**
 * Preloads the Latin sets of the fonts the stylesheet uses, so the page asks for them itself rather than once the app
 * draws text in them, and nothing shows in a stand-in font first. At low priority, so they wait on the app's script,
 * without which nothing is drawn at all.
 */
export function preloadFonts(): Plugin {
  let base = "/";
  return {
    name: "preload-fonts",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(_html, { bundle }) {
        const fonts = latinFonts(Object.keys(bundle ?? {}));
        if (fonts.length === 0) throw new Error("preload-fonts: the bundle has no Latin font files to preload");
        return fonts.map(
          (file): HtmlTagDescriptor => ({
            tag: "link",
            attrs: { rel: "preload", href: base + file, as: "font", type: "font/woff2", crossorigin: true, fetchpriority: "low" },
            injectTo: "head",
          }),
        );
      },
    },
  };
}
