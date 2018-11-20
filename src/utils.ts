
import { promisify } from "util";
import { readFileSync, readFile } from "fs";
import * as log from 'winston';

export let config = {
  port: "8080",
  data: {
    type: "local",
    source: "./data"
  },
  imports: {}
};

export function reloadConfig()
{
  try {
    const loadedConfig = JSON.parse(readFileSync("./config.json").toString("utf-8"));
    config = loadedConfig;
    console.log(`Configuration loaded.`);
  } catch (ex) {
    console.log(`Could not load configuration. Falling back to defaults.`);
  }
}

export function loadLibraries()
{
  Object.keys(config.imports).forEach((modName) => {
    try {
      global[modName] = require(config.imports[modName]);
      log.verbose(`Module ${config.imports[modName]} imported as '${modName}'.`);
    } catch (err) {
      log.error(`Unable to load module '${modName}'`);
    }
  });
}

export function reloadServiceFile(): Object
{
  try {
    const loadedService = JSON.parse(readFileSync("./data/service.json").toString("utf-8"));
    return loadedService;
  } catch (ex) {
    console.log(`Error: could not load the service file. Make sure you place the service.json in ./data`);
  }
}