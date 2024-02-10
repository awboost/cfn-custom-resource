import type { CloudFormationCustomResourceResponse } from "aws-lambda";
import { makeUnregisteredHandler } from "../unregistered-handler.js";

export const entrypoint = makeUnregisteredHandler(
  async (event, { logger }): Promise<CloudFormationCustomResourceResponse> => {
    logger.log(`HANDLER`, event);

    return {
      LogicalResourceId: event.LogicalResourceId,
      PhysicalResourceId: event.PhysicalResourceId,
      RequestId: event.RequestId,
      StackId: event.StackId,
      Status: "SUCCESS",
    };
  },
);
