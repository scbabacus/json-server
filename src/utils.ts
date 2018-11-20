
import { readFile, readFileSync } from "fs";
import { promisify } from "util";
import * as log from "winston";

export let config = {
  data: {
    source: "./data",
    type: "local",
  },
  imports: {},
  port: "8080",
  serviceDescriptor: "./data/service.json",
};

export function reloadConfig() {
  try {
    const loadedConfig = JSON.parse(readFileSync("./config.json").toString("utf-8"));
    config = loadedConfig;
    log.verbose(`Configuration loaded.`);
  } catch (ex) {
    log.error(`Could not load configuration. Falling back to defaults.`);
  }
}

export function loadLibraries() {
  Object.keys(config.imports).forEach((modName) => {
    try {
      global[modName] = require(config.imports[modName]);
      log.verbose(`Module ${config.imports[modName]} imported as '${modName}'.`);
    } catch (err) {
      log.error(`Unable to load module '${modName}'`);
    }
  });
}

export function reloadServiceFile(serviceFilePath: string): object {
  try {
    const loadedService = JSON.parse(readFileSync(serviceFilePath).toString("utf-8"));
    return loadedService;
  } catch (ex) {
    log.error(`Error: could not load the service file. Make sure '${serviceFilePath}' is accessible.`);
  }
}
