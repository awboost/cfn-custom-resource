import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import {
  makeRegisteredHandler,
  type HandlerProgressEvent,
} from "../registered-handler.js";
import type { AWBoostDevelopmentTestResourceModel } from "./model.generated.js";

export const entrypoint =
  makeRegisteredHandler<AWBoostDevelopmentTestResourceModel>(
    async (event, { credentials, logger }) => {
      logger.log("properties %O", event.requestData.resourceProperties);

      let sts = new STSClient({});
      let id = await sts.send(new GetCallerIdentityCommand({}));
      logger.log(`Base credentials`, id.Arn);

      sts = new STSClient({ credentials });
      id = await sts.send(new GetCallerIdentityCommand({}));
      logger.log(`Caller credentials`, id.Arn);

      const progress: HandlerProgressEvent<any, any> = {
        status: "SUCCESS",
      };

      switch (event.action) {
        case "CREATE":
        case "DELETE":
        case "READ":
        case "UPDATE":
          progress.resourceModel = event.requestData.resourceProperties;
          break;

        case "LIST":
          progress.resourceModels = [event.requestData.resourceProperties];
          break;
      }

      return progress;
    },
  );
