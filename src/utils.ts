import { readFile, readFileSync } from "fs";
import { promisify } from "util";
import * as log from "winston";
import { IFileReader } from "./file-reader";
import { S3Reader } from "./s3-reader";

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
  // auto inject of our local useful test library
  // tslint:disable:no-string-literal
  config.imports["lib"] = "./testlib";

  Object.keys(config.imports).forEach((modName) => {
    try {
      global[modName] = require(config.imports[modName]);
      log.verbose(`Module ${config.imports[modName]} imported as '${modName}'.`);
    } catch (err) {
      log.error(`Unable to load module '${modName}'`);
    }
  });
}

export function getReaderForUri(uri: string): IFileReader {
  if (S3Reader.isS3Uri(uri)) {
    return S3Reader.getInstance();
  }
}

export async function reloadServiceFile(serviceFilePath: string): Promise<object> {
  try {
    const rdr = getReaderForUri(serviceFilePath);
    const serviceFileContent = await rdr.readFile(serviceFilePath);
    const loadedService = JSON.parse(serviceFileContent);
    return loadedService;
  } catch (ex) {
    log.error(`Error: could not load the service file. Make sure '${serviceFilePath}' is accessible.`);
    log.debug(ex);
  }
}
