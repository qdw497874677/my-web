import { runData } from "../maintenance/data.js";

process.exitCode = runData(process.argv.slice(2));
