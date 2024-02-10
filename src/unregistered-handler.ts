import type {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceHandler,
  CloudFormationCustomResourceResponse,
  Context,
} from "aws-lambda";
import { createHash } from "node:crypto";
import https from "node:https";
import { format } from "node:util";
import { getStackNameWithId } from "./internal/stack-arn.js";
import { BufferedCloudWatchLogger, type Logger } from "./logger.js";

export type UnregisteredHandlerContext = {
  lambda: Context;
  logger: Logger;
};

export type UnregisteredResourceHandler = (
  event: CloudFormationCustomResourceEvent & { PhysicalResourceId: string },
  context: UnregisteredHandlerContext,
) => PromiseLike<CloudFormationCustomResourceResponse>;

export function makeUnregisteredHandler(
  handler: UnregisteredResourceHandler,
): CloudFormationCustomResourceHandler {
  return async (event, lambda) => {
    let response: CloudFormationCustomResourceResponse;
    let physicalResourceId: string;

    if (event.RequestType === "Create") {
      physicalResourceId = makePhysicalResourceId(
        event.StackId,
        event.LogicalResourceId,
      );
    } else {
      physicalResourceId = event.PhysicalResourceId;
    }

    const stackName = getStackNameWithId(event.StackId);
    const logStreamName = `${stackName}/${event.LogicalResourceId}`;
    const typeName = event.ResourceType.replace(/::/g, "-");
    const logGroupName = `/custom-resources/${typeName}`;

    const logger = new BufferedCloudWatchLogger({
      create: true,
      fallbackToConsole: true,
      logGroupName,
      logStreamName,
    });

    logger.log(
      `START ${event.RequestType} ${physicalResourceId} ${event.RequestId}`,
    );

    try {
      response = await handler(
        { ...event, PhysicalResourceId: physicalResourceId },
        { lambda, logger },
      );
    } catch (err) {
      response = {
        LogicalResourceId: event.LogicalResourceId,
        PhysicalResourceId: physicalResourceId,
        RequestId: event.RequestId,
        StackId: event.StackId,
        Status: "FAILED",
        Reason: format(err),
      };
    }

    try {
      logger.log(`RESPONSE ${response.Status} ${response.PhysicalResourceId}`);

      if (
        event.RequestType !== "Create" &&
        event.PhysicalResourceId !== response.PhysicalResourceId
      ) {
        logger.log(
          `PhysicalResourceId changed (was ${event.PhysicalResourceId})`,
        );
      }

      await sendResponse(event.ResponseURL, response);
      logger.log(`COMPLETE`);
    } catch (err) {
      logger.log(`ERROR sending response`, err);
    } finally {
      await logger.flush();
    }
  };
}

async function sendResponse(
  url: string,
  response: CloudFormationCustomResourceResponse,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(response));

    const req = https.request(
      url,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": body.length,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];

        res.on("data", (chunk) => chunks.push(chunk));
        res.on("error", reject);

        res.on("close", () =>
          // this will only reject if `end` was not already called
          reject(new Error(`the response was closed prematurely`)),
        );

        res.on("end", () => {
          const body = Buffer.concat(chunks).toString();
          const status = res.statusCode ?? 0;

          console.log(`received http response ${res.statusCode}`);
          console.log(body || "[no body]");

          if (status < 200 || status >= 300) {
            reject(new Error(`unexpected status code ${status}`));
          } else {
            resolve();
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function makePhysicalResourceId(
  stackId: string,
  logicalId: string,
  maxLength = 1024,
  hashLength = 6,
): string {
  if (maxLength < 0) {
    throw new Error(`can't have maxLength < 0`);
  }

  const defaultName = `${getStackNameWithId(stackId)}-${logicalId}`;
  const cleanName = defaultName.replace(/[^a-zA-Z0-9-_]/g, "");

  if (cleanName === defaultName && cleanName.length <= maxLength) {
    return cleanName;
  }

  const hash = createHash("sha1");
  hash.update(defaultName);

  return (
    cleanName.slice(0, maxLength - (hashLength + 1)) +
    "-" +
    hash.digest("hex").slice(0, hashLength)
  );
}
