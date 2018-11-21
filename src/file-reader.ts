import { readFile } from "fs";
import { promisify } from "util";

export interface IFileReader {
  readFile(path: string): Promise<string>;
}

const readFileAsync = promisify(readFile);

export class DefaultFileReader implements IFileReader {
  public async readFile(path: string, options?: any): Promise<string> {
    return readFileAsync(path, {encoding: "utf-8"});
  }
}
