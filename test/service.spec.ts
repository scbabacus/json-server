// tslint:disable

import "mocha";
import rewiremock from "rewiremock";
import { reloadConfig } from "../src/utils";
import { Service } from "../src/service";

describe("The mock", function() {
  before(() => {
    rewiremock("express").with(function() {
      
    });

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
  });

  
  it.skip("should work", function() {
    require("../src/utils").reloadConfig({});
    //reloadConfig({});
  });

  it("should work again", async () => {
    const svc = await import("../src/service");
    const exp = await import("express");

    const app = exp();
    const s: Service = {
      "/home/tryout": {
        get: {
          responseText: "hello",
        },
      }
    };

    svc.processService(app, s);
    
  });
});
