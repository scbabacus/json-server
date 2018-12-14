#!/usr/bin/env node

import * as bodyParser from "body-parser";
import { exec } from "child_process";
import * as express from "express";
import { RequestHandler } from "express-serve-static-core";
import * as fs from "fs";
import * as moment from "moment";
import { Server } from "net";
import { argv } from "process";
import * as log from "winston";
import { executeJsExpression, executeJsStatement } from "./executor";
import * as lib from "./testlib";
import { config,
         getReaderForUri,
         loadLibraries,
         parseParams,
         reloadConfig,
         reloadServiceFile,
         runInitializer,
       } from "./utils";

const params = parseParams(argv);
const configPath = params.config || "./config.json";
const init = params.init;
const loglevel = params.debug !== undefined ? "debug" : "info";

const app = express();
const contextData = {};

global.data = contextData;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

configureLogs(loglevel);

if (init !== undefined) { // init is expected to be null if presented on the command line.
  runInitializer();
  process.exit(0);
}

installSpecialCommands();
reloadConfig(configPath);
loadLibraries();

config.port = params.port || config.port || "80";

let server: Server | null = null;

(async () => {
  const service = await reloadServiceFile(config.serviceDescriptor || "./data/service.json");
  if (service !== null) {
    await processService(service as Service);
    if (!config.noDefaultIndex) { tryMountIndexPage(app, service as Service); }
    try {
      server = app.listen(config.port, () => log.info(`Listening ${config.port}`));
    } catch (err) {
      log.error(err);
    }
  } else {
    log.error(`Could not start server: failed to load the service descriptor file.`);
  }
})();

// tslint:disable:interface-name
interface MethodDef {
  condition?: string; // String expression returning boolean value
  processExpressions?: boolean; // whether to interpolate the results
  headers?: { // response headers
    [header: string]: string, // can be expression
  };
  redirect?: string; // URL to which response would be redirected. Mutually exclusive with response and errorResponse
  errorResponse?: number; // HTTP response code. Mutually exclusive with response and redirect
  response?: string;	// relative path to the file to use as a result. Supports: *.json, *.html
  responseText?: string; // constant text response
  preScript?: string; // Javascript to run before the response is sent
  postScript?: string; // Javascript to run after the response is sent
}

interface Service {
  [servicePath: string]: {
    [method: string]: MethodDef | MethodDef[],
  };
}

function configureLogs(level: string = "info") {
  const con = new log.transports.Console({
    format: log.format.printf((info) => `${moment().toISOString()} [${info.level}] ${info.message}`),
  });

  con.level = level;
  log.add(con);
}

function installSpecialCommands() {
  app.get("/_stop", (req, res) => {
    res.json({ success: true, time: moment().toISOString() });
    if (server) {
      server.close(() => log.info(`Server stopped at ${moment()}`));
    } else {
      log.error("The server is not currently active.");
    }
  });

  app.get("/_reload", async (req, res) => {
    const s = await reloadServiceFile(config.serviceDescriptor || "./data/service.json");
    await processService(s as Service);
    res.json({ success: true });
  });
}

function tryMountIndexPage(theApp: express.Application, service: Service) {
  if (service["/"] === undefined) {

    let indexPage: string | null = null;
    if (fs.existsSync("./index.html")) {
      indexPage = fs.readFileSync("./index.html", {encoding: "utf-8"});
    } else if (fs.existsSync("./dist/index.html")) {
      indexPage = fs.readFileSync("./dist/index.html", {encoding: "utf-8"});
    }

    theApp.get("/", (req, res) => {
      res.set("Content-type", "Text/html");
      res.end(indexPage);
    });

  }
}

async function processService(services: Service) {
  const router = express.Router();

  for (const svc of Object.keys(services).filter((route) => !route.match(/^\$/))) {
    for (const method of Object.keys(services[svc])) {
      const svcItem = services[svc];
      const methods: MethodDef[] = Array.isArray(svcItem[method]) ? svcItem[method] as MethodDef[]
        : [svcItem[method] as MethodDef];

      switch (method.toLowerCase()) {
        case "get": router.get(svc, await getServiceHandler(methods)); break;
        case "post": router.post(svc, await getServiceHandler(methods)); break;
        case "put": router.put(svc, await getServiceHandler(methods)); break;
        case "delete": router.delete(svc, await getServiceHandler(methods)); break;
        case "patch": router.patch(svc, await getServiceHandler(methods)); break;
        case "options": router.options(svc, await getServiceHandler(methods)); break;
        case "head": router.head(svc, await getServiceHandler(methods)); break;
        case "*": router.all(svc, await getServiceHandler(methods)); break;
        default:
          log.error(`Could not register service - unsupported HTTP method: ${method}`);
          continue; // so that we don't log the success.
      }

      log.info(`Service registered: ${method} ${svc}`);
    }
    app.use("/", router);
  }
}

async function getServiceHandler(plainMdef: MethodDef[]): Promise<RequestHandler> {
  return async (req: express.Request, res: express.Response) => {
    log.debug(`Request: '${req.url}'`);

    const context = {
      data: contextData,
      req, // short form
      request: req,
      res, // short form
      response: res,
    };

    const matchedMDef = getFirstMDefThatConditionEvaluatesToTrue(plainMdef, context);

    if (!matchedMDef) {
      res.sendStatus(404);
      return;
    }

    log.debug(`Method definition matched the request: ${JSON.stringify(matchedMDef)}`);

    global.request = req;
    global.response = res;
    global.req = req;
    global.res = res;

    printDebugDump();

    // PreScript has to be excuted before interpolation because the interpolation
    // process in other fields usually depends on the result of preScript execution.
    if (matchedMDef.preScript) {
      executeJsStatement(matchedMDef.preScript, context);
    }

    const mdef = await interpolateJSON(matchedMDef, context) as MethodDef;

    if (mdef.headers) {
      populateHeaders(mdef, context);
    }

    if (mdef.response) {
      await responseHandler(mdef, context);
    } else if (mdef.redirect) {
      redirectHandler(mdef, context);
    } else if (mdef.errorResponse) {
      errorHandler(mdef, context);
    } else if (mdef.responseText) {
      responseTextHandler(mdef, context);
    } else {
      res.sendStatus(500);
    }

    if (mdef.postScript) {
      executeJsStatement(mdef.postScript, context);
    }
  };
}

function getFirstMDefThatConditionEvaluatesToTrue(mdefArray: MethodDef[], context: object): MethodDef | undefined {
  return mdefArray.find((methodDef, idx, all) => {
    if (methodDef.condition !== undefined) {
      const matched = executeJsExpression(methodDef.condition, context) as boolean;
      return matched;
    } else {
      return true;
    }
  });
}

function interpolateHtml(html: string, context: object): string {
  return interpolateStringValue(html, context);
}

async function interpolateJSON(json: string | object, context: object): Promise<any> {
  const jsonData = typeof(json) === "object" ? json : JSON.parse(json);

  let resultingObject: {[key: string]: any} = {};

  for (const key of Object.keys(jsonData)) {
    if (key.match(/^\$/)) {
      resultingObject = await processCommand(key, jsonData[key], context);
    } else if (typeof jsonData[key] === "object") {
      resultingObject[key] = await interpolateJSON(JSON.stringify(jsonData[key]), context);
    } else if (typeof jsonData[key] === "string") {
      resultingObject[key] = interpolateStringValue(jsonData[key], context);
    } else {
      resultingObject[key] = jsonData[key];
    }
  }

  return resultingObject;
}

function populateHeaders(mdef: MethodDef, context: any) {
  const res: express.Response = context.res;
  if (mdef.headers === undefined) { throw new Error("Unexpected Error: missing headers in method definition"); }

  Object.keys(mdef.headers).forEach((hdr) => {
    if (mdef.headers !== undefined) {
      res.set(hdr, mdef.headers[hdr]);
    }
  });
}

async function responseHandler(mdef: MethodDef, context: any) {
  if (mdef.response === undefined) { throw new Error(`Unexpected Error: response is undefined.`); }

  const file = mdef.response;

  const interpolatedFile = interpolateStringValue(file, context);

  if (!fs.existsSync(interpolatedFile)) {
     context.res.sendStatus(404);
     log.error(`Error: File not found: ${interpolatedFile}`);
     return;
  }

  const rdr = getReaderForUri(interpolatedFile);
  const data = await rdr.readFile(interpolatedFile);

  if (interpolatedFile.match(/\.html$/i)) {
    const html = interpolateHtml(data, context);
    context.res.end(html);
  } else if (interpolatedFile.match(/\.json$/i)) {
    const json = await interpolateJSON(data, context);
    context.res.json(json);
  }
}

function redirectHandler(mdef: MethodDef, context: any) {
  context.res.redirect(mdef.redirect || "/");
}

function errorHandler(mdef: MethodDef, context: any) {
  context.res.redirect(mdef.errorResponse || 500);
}

function responseTextHandler(mdef: MethodDef, context: any) {
  context.res.send(mdef.responseText);
}

function interpolateStringValue(value: string, context: object): any {
  const expPattern = /\$\{(.*?)\}/g;
  let output = value;

  let match = expPattern.exec(value);

  // Return the exact type (i.e. number if result of expression is a number) if the
  // expression is a sole value of the string.
  if (match !== null && match[0] === value) {
    return executeJsExpression(match[1], context);
  }

  // Otherwise it's a string substitution in the larger string.
  while (match !== null) {
    const placeholder = match[0];
    const expression = match[1];
    const execResult = executeJsExpression(expression, context);
    output = output.replace(placeholder, execResult);
    match = expPattern.exec(value);
  }

  return output;
}

async function processCommand(command: string, innerJson: any, context: object): Promise<any> {

  const commandMap: {[fn: string]: (innerJson: any, context: object) => Promise<any>} = {
    $array: processArrayCommand,
    $csv: processCsvCommand,
    $exec: processExecCommand,
    $if: processIfCommand,
  };

  const fn = commandMap[command];
  if (fn !== undefined) {
    return await fn(innerJson, context);
  } else {
    log.warn(`Unrecognized command: '${command}'`);
    return { [command]: JSON.parse(innerJson) };
  }
}

interface ArrayDescriptor {
  count: number;
  element: any;
}

async function processArrayCommand(innerJson: any, context: object): Promise<any> {
  if (typeof innerJson !== "object") { throw Error(`expected object for $array value`); }

  const arrayDescriptor = innerJson as ArrayDescriptor;
  if (arrayDescriptor.count === undefined) { throw Error(`expected $array to contain .count`); }
  if (arrayDescriptor.element === undefined) { throw Error(`expected $array to contain .element`); }
  if (typeof arrayDescriptor.count !== "string" && typeof arrayDescriptor.count !== "number") { throw Error(`expected $array.element to be string or number`); }

  const result = [];
  let count = (typeof arrayDescriptor.count === "string")?interpolateStringValue(arrayDescriptor.count, context):arrayDescriptor.count;
  for (let i = 0; i < count; i++) {
    if (typeof arrayDescriptor.element === "object") {
      const elemValue = await interpolateJSON(JSON.stringify(arrayDescriptor.element), {...context, i});
      result.push(elemValue);
    } else if (typeof arrayDescriptor.element === "string") {
      const elemValue = interpolateStringValue(arrayDescriptor.element, {...context, i});
      result.push(elemValue);
    } else {
      result.push(arrayDescriptor.element);
    }
  }

  return result;
}

async function processExecCommand(innerJson: any, context: object): Promise<any> {
  if (typeof innerJson !== "string" || Array.isArray(innerJson)) {
    throw Error(`expected string or string array for $exec value`);
  }

  executeJsStatement(innerJson, context);
  return undefined; // such that the key is removed from the resulting object.
}

interface CsvDescriptor {
  file: string;
  element: any;
  firstLineHeader?: boolean;
  headers?: string[];
  delimiter?: string;
}

async function processCsvCommand(innerJson: any, context: object): Promise<any> {
  if (typeof innerJson !== "object") { throw Error(`expected object describing CSV descriptor`); }

  const csvDesc = innerJson as CsvDescriptor;
  const rdr = getReaderForUri(csvDesc.file);
  const content = await rdr.readFile(csvDesc.file);
  const delimiter = csvDesc.delimiter || ",";
  const lines = content.split("\n");
  let headers = csvDesc.headers || [];
  const results = [];
  let lineno = 0;

  for (const line of lines) {
    if (csvDesc.firstLineHeader && lineno === 0) {
      headers = line.split(delimiter);
      lineno++;
      return;
    }

    lineno++;

    const cols = line.split(delimiter);
    const col: {[key: string]: string} = {};
    headers.forEach((hdr, i) => col[hdr] = cols[i]);

    const processedElement = async () => {
      if (typeof(csvDesc.element) === "string") {
        return interpolateStringValue(csvDesc.element, {...context, lineno, cols, col});
      } else if (typeof(csvDesc.element) === "object") {
        return await interpolateJSON(csvDesc.element, {...context, lineno, cols, col});
      } else {
        return csvDesc.element;
      }
    };
    results.push(await processedElement);
  }

  return results;
}

async function processIfCommand(innerJson: any, context: object): Promise<any> {
  if (innerJson.condition === undefined) {
    throw Error("expected $if.condition to be provided.");
  }

  if (!innerJson.then) {
    throw Error("expected $if.then to be provided");
  }

  if (innerJson.condition) {
    return innerJson.then;
  } else {
    return innerJson.else;
  }
}

function printDebugDump() {
  if (loglevel !== "debug") { return; }
  log.debug(`ctx.data = ${JSON.stringify(global.data, null, 2)}`);
  log.debug(`ctx.req.headers  = ${JSON.stringify(global.req.headers, null, 2)}`);
  log.debug(`ctx.req.params  = ${JSON.stringify(global.req.params, null, 2)}`);
  log.debug(`ctx.req.query  = ${JSON.stringify(global.req.query, null, 2)}`);
  log.debug(`ctx.req.body  = ${JSON.stringify(global.req.body, null, 2)}`);
}
