import { readFile } from "fs";
import { promisify } from "util";

export interface IFileReader {
  readFile(path: string): Promise<string>;
}

const readFileAsync = promisify(readFile);

export class DefaultFileReader implements IFileReader {
  public static getInstance() {
    return DefaultFileReader.instance || (DefaultFileReader.instance = new DefaultFileReader());
  }

  private static instance: DefaultFileReader | null = null;

  public async readFile(path: string): Promise<string> {
    return await readFileAsync(path, {encoding: "utf-8"});
  }
}
