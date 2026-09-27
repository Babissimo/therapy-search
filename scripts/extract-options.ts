import "./dom";
import { parseOptions } from "../shared/ukcp/parseOptions";
import { writeOptions } from "./optionsFile";
import { scriptClient } from "./ukcp";

// Refreshes shared/options.json from UKCP's live search form. One request.
const options = parseOptions(await scriptClient("option list refresh").searchPage());
writeOptions(options);
console.log(`wrote ${options.groups.length} filter groups and ${options.helpWith.length} help-with terms`);
