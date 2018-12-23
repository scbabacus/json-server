// tslint:disable

import "mocha";
import { expect } from "chai";

import rewiremock from "rewiremock";
import { reloadConfig } from "../src/utils";
import { Service } from "../src/service";
import { fail } from "assert";

let exp: any = null;

interface SpiedRoute {
  [routeUrl: string]: Function;
}

var spy = {
  get(url: string, handler: Function) { 
    this.spiedRoutes[`get ${url}`] = handler;  
  },
  post(url: string, handler: Function) {},
  put(url: string, handler: Function) {},
  delete(url: string, handler: Function) {},
  head(url: string, handler: Function) {},
  options(url: string, handler: Function) {},
  use(middleware: any, handler: Function) {},

  spiedRoutes: {} as SpiedRoute
};

describe("Service Test", function() {
  const express: any = function() {
    return spy;
  };

  express.Router = function() {
    return spy;
  }

  before(async () => {
    rewiremock("express").with(express);

    rewiremock("fs").with({  
        readFileSync(path: string): Buffer {
          console.log("Readfile captured.");
          return Buffer.from("Hello world", "utf-8");
        },
        readFile(path: string, callback: any): Promise<any> {
          return Promise.resolve({});
        }
    });
    rewiremock.enable();
    exp = await import("express");
  });

  describe("processService", () => {
    it("should register get service correctly", async () => {
      const svc = await import("../src/service");
      const app = exp();
      const s: Service = {
        "/home/tryout": {
          get: {
            responseText: "hello",
          },
        }
      };
  
      svc.processService(app, s);
      console.log(spy);
      expect(spy.spiedRoutes).to.have.property("get /home/tryout");
    });
  });
  
});
