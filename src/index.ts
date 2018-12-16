#!/usr/bin/env node

import * as bodyParser from "body-parser";
import { exec } from "child_process";
import * as express from "express";
import { argv } from "process";
import * as log from "winston";
import { startService } from "./service";
import * as lib from "./testlib";
import { config,
         configureLogs,
         loadLibraries,
         parseParams,
         reloadConfig,
         runInitializer,
       } from "./utils";

const params = parseParams(argv);
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const loglevel = params.debug !== undefined ? "debug" : "info";
configureLogs(loglevel);

if (params.init !== undefined) { // init is expected to be null if presented on the command line.
  runInitializer();
  process.exit(0);
} else {
  reloadConfig(params);
  loadLibraries();
  startService(app, config.port);
}
