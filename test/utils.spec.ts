import { expect } from "chai";
import "mocha";
import rewiremock from "rewiremock";
import * as sinon from "sinon";

import { S3Reader } from "../src/s3-reader";
import { config, getReaderForUri, parseParams } from "../src/utils";
import { DefaultFileReader } from "./../src/file-reader";

// tslint:disable:no-unused-expression
describe("Utility Tests", () => {
  describe("#parse params", () => {
    it("should parse double dash param with parameter", () => {
      const args = ["jsonsvr", "--param1", "value1", "--param2", "value2"];
      const cmdlineParams = parseParams(args);
      expect(cmdlineParams).to.have.property("param1");
      expect(cmdlineParams).to.have.property("param2");
      expect(cmdlineParams.param1).to.equal("value1");
      expect(cmdlineParams.param2).to.equal("value2");
    });

    it("should parse double dash param without value", () => {
      const args = ["jsonsvr", "--param_wo_value"];
      const cmdlineParams = parseParams(args);
      expect(cmdlineParams).to.have.property("param_wo_value");
      expect(cmdlineParams.param_wo_value).to.be.null;
    });

    it("should parse param without value that is not the last param", () => {
      const args = ["jsonsvr", "--param_wo_value", "--another param"];
      const cmdlineParams = parseParams(args);
      expect(cmdlineParams).to.have.property("param_wo_value");
      expect(cmdlineParams.param_wo_value).to.be.null;
    });

    it("should parse param without double dash as a blank key, appended together delimited by space", () => {
      const args = ["jsonsvr", "unnamed param 1", "unnamed param 2", "--namedParam", "named param value"];
      const cmdlineParams = parseParams(args);
      expect(cmdlineParams).to.have.property("");
      expect(cmdlineParams[""]).to.eql("jsonsvr unnamed param 1 unnamed param 2");
    });
  });

  describe("#reloadConfig", () => {
    let spy: sinon.SinonSpy | null = null;
    let util: any = null;

    beforeEach(async () => {
      spy = sinon.fake(() => Buffer.from(`{"port": "4567"}`, "utf-8"));
      rewiremock("fs").with({
        readFileSync: spy,
      });
      rewiremock.enable();
      util = await import("../src/utils");
    });

    it("should load the config from file ./config.json if no config has been given", async () => {
      util.reloadConfig();
      if (spy) { expect(spy.calledWith("./config.json")).to.be.true; }
    });

    it("should correctly assign the port by overriding param, if supplied", () => {
      util.reloadConfig({ port: "1234" });
      expect(util.config.port).to.eql("1234");
    });

    it("should correctly assign the port from config", () => {
      util.reloadConfig();
      expect(util.config.port).to.eql("4567");
    });

    it("should override service.json by environment", () => {
      util.reloadConfig({ service: "./another-service.json" });
      expect(util.config.serviceDescriptor).to.eql("./another-service.json");
    });

    it("should use the serviceDescriptor from the config if no overriding found", () => {
      util.reloadConfig();
      expect(util.config.serviceDescriptor).to.eql("./service.json");
    });
  });

  describe("#getReaderFromUri", () => {

    it("should recognize s3 uri and return s3 reader", () => {
      const uri = "s3://bucket-uri.com/key/service.json";
      expect(getReaderForUri(uri)).to.be.an.instanceOf(S3Reader);
    });

    it("should recognize file uri and return s3 reader", () => {
      const uri = "./some/directory/service.json";
      expect(getReaderForUri(uri)).to.be.an.instanceOf(DefaultFileReader);
    });

  });
});
