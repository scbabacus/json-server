import { existsSync, readFile, readFileSync, writeFileSync } from "fs";
import { promisify } from "util";
import * as log from "winston";
import { executeJsStatement } from "./executor";
import { DefaultFileReader, IFileReader } from "./file-reader";
import { S3Reader } from "./s3-reader";

interface IJsonServerConfig {
  imports: { [aliasName: string]: string };
  port: string;
  serviceDescriptor: string;
  noDefaultIndex?: boolean;
}

export let config: IJsonServerConfig = {
  imports: {},
  noDefaultIndex: false,
  port: "8080",
  serviceDescriptor: "./data/service.json",
};

export function parseParams(args: string[]): {[param: string]: string | null} {
  const params: {[key: string]: string | null} = {};

  args.forEach((arg, i) => {
    const matches = arg.match(/^\-\-(.*)/);
    if (matches) {
      const argName = matches[1];
      const argValue = i < args.length - 1 ? args[i + 1] : null;
      params[argName] = argValue;
    }
  });

  return params;
}

export function reloadConfig(configPath: string) {
  try {
    const loadedConfig = JSON.parse(readFileSync(configPath).toString("utf-8"));
    config = loadedConfig;
    log.verbose(`Configuration loaded.`);
  } catch (ex) {
    log.error(`Could not load configuration from './config.json'. Falling back to defaults.`);
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
  } else {
    return DefaultFileReader.getInstance();
  }
}

export async function reloadServiceFile(serviceFilePath: string): Promise<object | null> {
  try {
    const rdr = getReaderForUri(serviceFilePath);
    const serviceFileContent = await rdr.readFile(serviceFilePath);
    if (serviceFileContent !== null) {
      const loadedService = JSON.parse(serviceFileContent);
      executeServiceInitializer(loadedService);
      return loadedService;
    } else {
      return null;
    }
  } catch (ex) {
    log.error(`could not load the service file. Make sure '${serviceFilePath}' ` +
              `is accessible. Run 'jsonsvr --init' to create the initial configurations.`);
    log.debug(ex);
  }
  return null;
}

export function runInitializer() {
  if (!existsSync("./config.json")) {
    const configTemplate = require("./config.template.json");
    writeFileSync("./config.json", JSON.stringify(configTemplate, null, 2), { encoding: "utf-8" });
    log.info("The file ./config.json has been created.");
  } else {
    log.warn("./config.json exists, will not overwrite.");
  }

  if (!existsSync("./service.json")) {
    const serviceTemplate =  require("./service.template.json");
    writeFileSync("./service.json", JSON.stringify(serviceTemplate, null, 2), { encoding: "utf-8" });
    log.info("The file ./service.json has been created.");
  } else {
    log.warn("./service.json exists, will not overwrite");
  }
}

function executeServiceInitializer(serviceDef: any) {
  if (!serviceDef.$init) { return; }

  const ctx = {
    data: global.data,
  };

  executeJsStatement(serviceDef.$init, ctx);
}
