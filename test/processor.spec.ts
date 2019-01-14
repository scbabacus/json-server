import "chai";
import { expect } from "chai";
import "mocha";
import rewiremock from "rewiremock";
import { spy } from "sinon";

import * as processor from "../src/processor";
import { MethodDef } from "../src/service";

// tslint:disable:no-unused-expression
describe("Processor Test", () => {
  describe("#redirectHandler", () => {
    it("should call the response redirect", async () => {
      const redirectSpy = spy();
      const mdef: MethodDef = {
        redirect: "http://www.google.com",
        redirectQueryString: true,
      };

      const context: any = {
        req: {
          url: "http://www.scbabacus.com/original/path?original=1&query=2&string=3",
        },

        res: {
          redirect: redirectSpy,
        },
      };

      await processor.interpretMethodDefinitions([mdef], context);
      expect(redirectSpy.calledWith("http://www.google.com/?original=1&query=2&string=3")).to.be.true;
    });

    it("should overwrite all the original url's query strings when enable the redirect query option.",  async () => {
      const redirectSpy = spy();
      const mdef: MethodDef = {
        redirect: "http://www.google.com/?the=query&string=to_be_replaced",
        redirectQueryString: true,
      };

      const context: any = {
        req: {
          url: "http://www.scbabacus.com/original/path?original=1&query=2&string=3",
        },

        res: {
          redirect: redirectSpy,
        },
      };
      await processor.interpretMethodDefinitions([mdef], context);
      expect(redirectSpy.calledWith("http://www.google.com/?original=1&query=2&string=3")).to.be.true;
    });
  });

  describe.only("proxy handler", async () => {
    it("should redirect proxy to the certain thing", async () => {
      const sendSpy = spy();
      const mdef: MethodDef = {
        proxy: "http://www.google.com",
      };

      const context: any = {
        req: {
          url: "http://www.scbabacus.com/original/path?original=1&query=2&string=3",
        },

        res: {
          send: sendSpy,
          status: () => 200,
        },
      };

      const fetchSpy = spy();

      rewiremock("node-fetch").withDefault((url: string, options: any) => {
        console.log("url is " + url);
        fetchSpy();
      });
      rewiremock.enable();

      const mockedProcessor = await import("../src/processor");

      await mockedProcessor.interpretMethodDefinitions([mdef], context);
      expect(sendSpy.called, "send").to.be.true;
      expect(fetchSpy.called, "fetch").to.be.true;

      rewiremock.disable();
    });
  });
});
