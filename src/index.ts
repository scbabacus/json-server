import * as bodyParser from "body-parser";
import { exec } from "child_process";
import * as express from "express";
import { RequestHandler } from "express-serve-static-core";
import * as fs from "fs";
import * as moment from "moment";
import * as log from "winston";
import * as lib from "./testlib";
import { config, loadLibraries, reloadConfig, reloadServiceFile } from "./utils";

const app = express();
const contextData = {};

app.use(bodyParser.json());
app.use(bodyParser.urlencoded());

reloadConfig();
configureLogs();
loadLibraries();

const service = reloadServiceFile(config.serviceDescriptor || "./data/service.json");
processService(service as Service);

app.listen(config.port, () => log.info(`Listening ${config.port}`));

// tslint:disable:interface-name
interface MethodDef {
  condition?: string; // String expression (starts with $) returning boolean value
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
    [method: string]: MethodDef,
  };
}

function configureLogs() {
  const con = new log.transports.Console({
    format: log.format.printf((info) => `${moment().toISOString()} [${info.level}] ${info.message}`),
  });

  con.level = "debug";
  log.add(con);
}

function processService(services: Service) {
  for (const svc of Object.keys(services)) {
    for (const method of Object.keys(services[svc])) {
      const svcItem = services[svc];

      switch (method.toLowerCase()) {
        case "get": app.get(svc, getServiceHandler(svcItem[method])); break;
        case "post": app.post(svc, getServiceHandler(svcItem[method])); break;
        case "put": app.put(svc, getServiceHandler(svcItem[method])); break;
        case "delete": app.delete(svc, getServiceHandler(svcItem[method])); break;
        case "patch": app.patch(svc, getServiceHandler(svcItem[method])); break;
        case "options": app.options(svc, getServiceHandler(svcItem[method])); break;
        case "head": app.head(svc, getServiceHandler(svcItem[method])); break;
        case "*": app.all(svc, getServiceHandler(svcItem[method])); break;
        default:
          log.error(`Could not register service - unsupported HTTP method: ${method}`);
          continue; // so that we don't log the success.
      }

      log.info(`Service registered: ${method} ${svc}`);
    }
  }
}

function getServiceHandler(plainMdef: MethodDef): RequestHandler {
  return (req: express.Request, res: express.Response) => {
    const context = {
      data: contextData,
      req, // short form
      request: req,
      res, // short form
      response: res,
    };

    global.request = req;
    global.response = res;
    global.req = req;
    global.res = res;
    global.data = contextData;

    const mdef = interpolateJSON(plainMdef, context) as MethodDef;

    if (mdef.condition) {
      log.warn("The 'condition' is not yet supported in this version.");
    }

    if (mdef.preScript) {
      executeJsExpression(mdef.preScript, context);
    }

    if (mdef.headers) {
      populateHeaders(mdef, context);
    }

    if (mdef.response) {
      responseHandler(mdef, context);
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
      executeJsExpression(mdef.postScript, context);
    }
  };
}

function interpolateHtml(html: string, context: object): string {
  return interpolateStringValue(html, context);
}

function interpolateJSON(json: string | object, context: object): any {
  const jsonData = typeof(json) === "object" ? json : JSON.parse(json);

  let resultingObject = {};

  for (const key of Object.keys(jsonData)) {
    if (key.match(/^\$/)) {
      resultingObject = processCommand(key, jsonData[key], context);
    } else if (typeof jsonData[key] === "object") {
      resultingObject[key] = interpolateJSON(JSON.stringify(jsonData[key]), context);
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
  Object.keys(mdef.headers).forEach((hdr) => {
    res.set(hdr, mdef.headers[hdr]);
  });
}

function responseHandler(mdef: MethodDef, context: any) {
  const file = mdef.response;

  const interpolatedFile = interpolateStringValue(file, context);

  if (!fs.existsSync(interpolatedFile)) {
     context.res.sendStatus(404);
     log.error(`Error: File not found: ${interpolatedFile}`);
     return;
  }

  const data = fs.readFileSync(interpolatedFile, { encoding: "utf-8" });

  if (interpolatedFile.match(/\.html$/i)) {
    const html = interpolateHtml(data, context);
    context.res.end(html);
  } else if (interpolatedFile.match(/\.json$/i)) {
    const json = interpolateJSON(data, context);
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

function executeJsExpression(exp: string, context: object): any {
  const functionedExpression = `return ${exp};`;

  const f = new Function("ctx", functionedExpression);
  const result = f(context);

  return result;
}

function processCommand(command: string, innerJson: any, context: object): any {
  if (command === "$array") {
    return processArrayCommand(innerJson, context);
  } else if (command === "$exec") { return processExecCommand(innerJson, context); }
}

interface ArrayDescriptor {
  count: number;
  element: any;
}

function processArrayCommand(innerJson: any, context: object): any {
  if (typeof innerJson !== "object") { throw Error(`expected object for $array value`); }

  const arrayDescriptor = innerJson as ArrayDescriptor;
  if (arrayDescriptor.count === undefined) { throw Error(`expected $array to contain .count`); }
  if (arrayDescriptor.element === undefined) { throw Error(`expected $array to contain .element`); }

  const result = [];

  for (let i = 0; i < arrayDescriptor.count; i++) {
    if (typeof arrayDescriptor.element === "object") {
      const elemValue = interpolateJSON(JSON.stringify(arrayDescriptor.element), {...context, i});
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

function processExecCommand(innerJson: any, context: object): any {
  if (typeof innerJson !== "string") { throw Error(`expected string for $exec value`); }

  executeJsExpression(innerJson, context);
  return undefined; // such that the key is removed from the resulting object.
}
