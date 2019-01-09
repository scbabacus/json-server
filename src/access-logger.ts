import { NextFunction, Request, Response } from "express";
import { config, logAccess } from "./utils";

// tslint:disable:only-arrow-functions
export function accessLogger(req: Request, res: Response, next: NextFunction) {
  if (config.accessLog) {
    logRequest(req);
    logResponse(res);
  }
  next();
}

function logRequest(req: Request) {
  logAccess(`Request from: ${req.ip}`);
  logAccess(`${req.method} ${req.url}`);
  logAccess(JSON.stringify(req.headers));
  logAccess("");
  logAccess(JSON.stringify(req.body));
}

function logResponse(res: Response) {
  const oldWrite = res.write;
  const oldEnd = res.end;
  const chunks = [] as Uint8Array[];

  res.write = function(chunk: any) {
    chunks.push(chunk);
    return oldWrite.apply(res, chunk) as boolean;
  };

  res.end = function(chunk: any) {
    if (chunk) {
      if (typeof(chunk) === "string") {
        chunk = Buffer.from(chunk);
      }
      chunks.push(chunk);
    }

    if (Array.isArray(chunks)) {
      const body = Buffer.concat(chunks).toString("utf8");
      oldEnd.apply(res, [chunk]);
      logAccess(`Response Status: ${res.statusCode}`);
      logAccess(JSON.stringify(res.getHeaders()));
      logAccess(body);
    } else {
      oldEnd.apply(res, [chunks]);
    }
  };
}
