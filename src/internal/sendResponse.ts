import { CloudFormationCustomResourceResponse } from 'aws-lambda';
import https from 'https';

export class SendResponseError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(`sendResponse (${statusCode}): ${message}`);
  }
}

export async function sendResponse(
  url: string,
  response: CloudFormationCustomResourceResponse,
): Promise<void> {
  try {
    console.log(`writing custom resource response to %s %O`, url, response);

    await new Promise<void>((resolve, reject) => {
      const body = Buffer.from(JSON.stringify(response));

      const req = https.request(
        url,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': body.length,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];

          res.on('data', (chunk) => chunks.push(chunk));
          res.on('error', reject);

          res.on('close', () =>
            // this will only reject if `end` was not already called
            reject(new Error(`the response was closed prematurely`)),
          );

          res.on('end', () => {
            const body = Buffer.concat(chunks).toString();
            const status = res.statusCode ?? 0;

            console.log(`received http response ${res.statusCode}`);
            console.log(body || '[no body]');

            if (status < 200 || status >= 300) {
              reject(new SendResponseError(`unexpected status code`, status));
            } else {
              resolve();
            }
          });
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  } catch (err) {
    console.log(`error while writing custom resource response`, err);
    throw err;
  } finally {
    console.log(`writing custom resource response done`);
  }
}
