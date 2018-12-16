import * as express from "express";
import * as fs from "fs";
import * as log from "winston";

import { executeJsExpression, executeJsStatement } from "./executor";
import { MethodDef } from "./service";
import { getReaderForUri, printDebugDump } from "./utils";

export async function interpretMethodDefinitions(mdefArray: MethodDef[], context: any) {
  const matchedMDef = getFirstMDefThatConditionEvaluatesToTrue(mdefArray, context);
  const res = context.res as express.Response;

  if (!matchedMDef) {
    res.sendStatus(404);
    return;
  }

  log.debug(`Method definition matched the request: ${JSON.stringify(matchedMDef)}`);

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
}

function getFirstMDefThatConditionEvaluatesToTrue(mdefArray: MethodDef[], context: object)
    : MethodDef | undefined {
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
  const res = context.res as express.Response;
  if (mdef.headers === undefined) {
    throw new Error("Unexpected Error: missing headers in method definition");
  }

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

interface IArrayDescriptor {
  count: number;
  element: any;
}

async function processArrayCommand(innerJson: any, context: object): Promise<any> {
  if (typeof innerJson !== "object") { throw Error(`expected object for $array value`); }

  const arrayDescriptor = innerJson as IArrayDescriptor;
  if (arrayDescriptor.count === undefined) { throw Error(`expected $array to contain .count`); }
  if (arrayDescriptor.element === undefined) { throw Error(`expected $array to contain .element`); }

  const result = [];

  for (let i = 0; i < arrayDescriptor.count; i++) {
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

interface ICsvDescriptor {
  file: string;
  element: any;
  firstLineHeader?: boolean;
  headers?: string[];
  delimiter?: string;
}

async function processCsvCommand(innerJson: any, context: object): Promise<any> {
  if (typeof innerJson !== "object") { throw Error(`expected object describing CSV descriptor`); }

  const csvDesc = innerJson as ICsvDescriptor;
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
