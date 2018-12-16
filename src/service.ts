import * as express from "express";
import * as fs from "fs";
import * as moment from "moment";
import { Server } from "net";
import * as log from "winston";
import { executeJsStatement } from "./executor";
import { interpretMethodDefinitions } from "./processor";
import { config, reloadServiceFile } from "./utils";

let server: Server | null = null;
const contextData = {};
global.data = contextData;

// tslint:disable:interface-name
export interface MethodDef {
  condition?: string; // String expression returning boolean value
  processExpressions?: boolean; // whether to interpolate the results
  headers?: { // response headers
    [header: string]: string, // can be expression
  };
  redirect?: string; // URL to which response would be redirected. Mutually exclusive with response and errorResponse
  errorResponse?: number; // HTTP response code. Mutually exclusive with response and redirect
  response?: string;	// relative path to the file to use as a result. Supports: *.json, *.html
  responseText?: string; // constant text response
  preScript?: string | string[]; // Javascript to run before the response is sent
  postScript?: string | string[]; // Javascript to run after the response is sent
}

export interface Service {
  [servicePath: string]: {
    [method: string]: MethodDef | MethodDef[],
  };
}

export async function startService(app: express.Application, port: string) {
  const service = await reloadServiceFile(config.serviceDescriptor || "./data/service.json");
  if (service !== null) {
    await processService(app, service as Service);
    if (!config.noDefaultIndex) { tryMountIndexPage(app, service as Service); }
    try {
      server = app.listen(port, () => log.info(`Listening ${port}`));
    } catch (err) {
      log.error(err);
    }
  } else {
    log.error(`Could not start server: failed to load the service descriptor file.`);
  }
}

export async function processService(app: express.Application, services: Service) {
  const router = express.Router();

  for (const svc of Object.keys(services).filter((route) => !route.match(/^\$/))) {
    for (const method of Object.keys(services[svc])) {
      const svcItem = services[svc];
      const methodDefs: MethodDef[] = Array.isArray(svcItem[method]) ? svcItem[method] as MethodDef[]
        : [svcItem[method] as MethodDef];

      switch (method.toLowerCase()) {
        case "get": router.get(svc, await getServiceHandler(methodDefs)); break;
        case "post": router.post(svc, await getServiceHandler(methodDefs)); break;
        case "put": router.put(svc, await getServiceHandler(methodDefs)); break;
        case "delete": router.delete(svc, await getServiceHandler(methodDefs)); break;
        case "patch": router.patch(svc, await getServiceHandler(methodDefs)); break;
        case "options": router.options(svc, await getServiceHandler(methodDefs)); break;
        case "head": router.head(svc, await getServiceHandler(methodDefs)); break;
        case "*": router.all(svc, await getServiceHandler(methodDefs)); break;
        default:
          log.error(`Could not register service - unsupported HTTP method: ${method}`);
          continue; // so that we don't log the success.
      }

      log.info(`Service registered: ${method} ${svc}`);
    }

    app.use("/", router);
    installSystemApis(app);
  }
}

async function getServiceHandler(plainMdef: MethodDef[]): Promise<express.RequestHandler> {
  return async (req: express.Request, res: express.Response) => {
    log.debug(`Request: '${req.url}'`);

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

    interpretMethodDefinitions(plainMdef, context);
  };
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

function installSystemApis(app: express.Application) {
  app.get("/_stop", (req, res) => {
    res.json({ success: true, time: moment().toISOString() });
    if (server) {
      server.close(() => log.info(`Server stopped at ${moment().toISOString()}`));
    } else {
      log.error("The server is not currently active.");
    }
  });

  app.get("/_reload", async (req, res) => {
    if (server) {
      res.json({ message: "Service reload request submitted."
          + "The reload may take time to take effect." , success: true });
      log.info("Reloading the service definition");
      server.getConnections((err, count) => err ? `Could not count connections`
              : log.debug(`The server currently has ${count} connections.`));
      server.close(async (err: Error) => {
        if (!err) {
          server = null;
          log.verbose("The server closed");
          app = express();
          startService(app, config.port);
          log.info("The services reloaded.");
        } else {
          log.error(`Failed to terminate the server: ${err}`);
        }
      });
    } else {
      res.json({ success: false, message: "Server is not currently active" });
      log.error("The server is not currently active");
    }
  });
}
