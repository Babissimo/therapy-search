import { JSDOM } from "jsdom";

// The page parsers read HTML with the browser's DOMParser, which Node lacks.
globalThis.DOMParser = new JSDOM().window.DOMParser;
