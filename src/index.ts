import { exec } from "child_process";
import * as express from "express";
import { RequestHandler } from "express-serve-static-core";
import * as fs from "fs";
import * as moment from "moment";
import * as log from "winston";
import { config, loadLibraries, reloadConfig, reloadServiceFile } from "./utils";

const app = express();
const contextData = {};

const con = new log.transports.Console({
  format: log.format.printf((info) => `${moment().toISOString()} [${info.level}] ${info.message}`),
});

con.level = "debug";
log.add(con);

app.use("/", (req, res, next) => {
  log.verbose(`path: ${req.path}`);
  log.verbose("query");
  log.verbose(JSON.stringify(req.query));
  log.verbose("params");
  log.verbose(JSON.stringify(req.params));
  log.verbose("body");
  log.verbose(JSON.stringify(req.body));

  next();
});

reloadConfig();
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
}

interface Service {
  [servicePath: string]: {
    [method: string]: MethodDef,
  };
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

function getServiceHandler(mdef: MethodDef): RequestHandler {
    return (req: express.Request, res: express.Response) => {
      const file = mdef.response;
      const context = {
        data: contextData,
        request: req,
        response: res,
      };

      const interpolatedFile = interpolateStringValue(file, context);

      if (!fs.existsSync(interpolatedFile)) {
         res.sendStatus(404);
         log.error(`Error: File not found: ${interpolatedFile}`);
         return;
      }

      const data = fs.readFileSync(interpolatedFile, { encoding: "utf-8" });

      if (interpolatedFile.match(/\.html$/i)) {
        const html = interpolateHtml(data, context);
        res.end(html);
      } else if (interpolatedFile.match(/\.json$/i)) {
        const json = interpolateJSON(data, context);
        res.json(json);
      }
    };
}

function interpolateHtml(html: string, context: object): string {
  return interpolateStringValue(html, context);
}

function interpolateJSON(json: string, context: object): any {
  const jsonData = JSON.parse(json);

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
  element: object;
}

function processArrayCommand(innerJson: any, context: object): any {
  if (typeof innerJson !== "object") { throw Error(`expected object for $array value`); }

  const arrayDescriptor = innerJson as ArrayDescriptor;
  if (arrayDescriptor.count === undefined) { throw Error(`expected $array to contain .count`); }
  if (arrayDescriptor.element === undefined) { throw Error(`expected $array to contain .element`); }

  const result = [];

  for (let i = 0; i < arrayDescriptor.count; i++) {
    const elemValue = interpolateJSON(JSON.stringify(arrayDescriptor.element), {...context, i});
    result.push(elemValue);
  }

  return result;
}

function processExecCommand(innerJson: any, context: object): any {
  if (typeof innerJson !== "string") { throw Error(`expected string for $exec value`); }

  executeJsExpression(innerJson, context);
  return undefined; // such that the key is removed from the resulting object.
}
