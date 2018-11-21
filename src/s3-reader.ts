import * as aws from "aws-sdk";
import { promisify } from "util";
import { IFileReader } from "./file-reader";

const s3 = new aws.S3();

export class S3Reader implements IFileReader {

  public static isS3Uri(uri: string): boolean {
    return uri.match(/^s3\:\/\/(.*?)(\/.*)$/i) !== null;
  }

  public static getInstance(): S3Reader {
    return S3Reader.instance || (S3Reader.instance = new S3Reader());
  }

  private static instance: S3Reader | null = null;

  private constructor() {
  }

  public async readFile(uri: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {

      if (!uri.match(/^s3\:\/\//i)) {
        throw new URIError(`The S3 URI ${uri} is not a valid s3 URI. Must start with s3://`);
      }

      const getObjRequest = this.createGetObjectRequestFromUri(uri);

      s3.getObject(getObjRequest, (err, data) => {
        if (!err) {
          if (data.Body) {
            const content = data.Body.toString();
            resolve(content);
          } else {
            reject(`Empty file from S3.`);
          }
        } else {
          reject(err);
        }
      });
    });
  }

  private createGetObjectRequestFromUri(uri: string): aws.S3.GetObjectRequest {
    const captured = uri.match(/^s3\:\/\/(.*?)\/(.*)$/i);
    if (captured === null) { throw new Error(`The URI ${uri} is not an S3 URI.`); }
    const bucket = captured[1];
    const key = captured[2];

    return {
      Bucket: bucket,
      Key: key,
    };
  }
}
