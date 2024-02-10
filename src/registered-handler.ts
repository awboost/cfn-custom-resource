import type { Context, Credentials, Handler } from "aws-lambda";
import { format } from "util";
import { getStackNameWithId } from "./internal/stack-arn.js";
import {
  BufferedCloudWatchLogger,
  ConsoleLogger,
  type Logger,
} from "./logger.js";

export type HandlerAction = "CREATE" | "READ" | "UPDATE" | "DELETE" | "LIST";

export type OperationStatus = "PENDING" | "IN_PROGRESS" | "SUCCESS" | "FAILED";

export type ErrorCode =
  | "AccessDenied"
  | "AlreadyExists"
  | "GeneralServiceException"
  | "InternalFailure"
  | "InvalidCredentials"
  | "InvalidRequest"
  | "InvalidTypeConfiguration"
  | "NetworkFailure"
  | "NotFound"
  | "NotStabilized"
  | "NotUpdatable"
  | "ResourceConflict"
  | "ServiceInternalError"
  | "ServiceLimitExceeded"
  | "Throttling";

export type HandlerProgressEvent<Model, CallbackCtx> = {
  /**
   * The status indicates whether the handler has reached a terminal state or is
   * still computing and requires more time to complete
   */
  status: OperationStatus;
  /**
   * If OperationStatus is FAILED or IN_PROGRESS, an error code should be provided
   */
  errorCode?: ErrorCode;
  /**
   * The handler can (and should) specify a contextual information message which
   * can be shown to callers to indicate the nature of a progress transition or
   * callback delay; for example a message indicating "propagating to edge"
   */
  message?: string;
  /**
   * The callback context is an arbitrary datum which the handler can return in an
   * IN_PROGRESS event to allow the passing through of additional state or
   * metadata between subsequent retries; for example to pass through a Resource
   * identifier which can be used to continue polling for stabilization
   */
  callbackContext?: CallbackCtx;
  /**
   * A callback will be scheduled with an initial delay of no less than the number
   * of seconds specified in the progress event.
   */
  callbackDelaySeconds?: number;
  /**
   * The output resource instance populated by a READ for synchronous results and
   * by CREATE/UPDATE/DELETE for final response validation/confirmation
   */
  resourceModel?: Model;
  /**
   * The output resource instances populated by a LIST for synchronous results
   */
  resourceModels?: Model[];
  /**
   * The token used to request additional pages of resources for a LIST operation
   */
  nextToken?: string;
};

export type RequestData<Model> = {
  resourceProperties: Model;
  providerLogGroupName?: string;
  logicalResourceId?: string;
  systemTags?: Record<string, string>;
  stackTags?: Record<string, string>;
  callerCredentials?: Credentials;
  providerCredentials?: Credentials;
  previousResourceProperties?: Model;
  previousStackTags?: Record<string, string>;
  typeConfiguration?: Record<string, string>;
};

export type RequestContext<CallbackCtx> = {
  invocation: number;
  callbackContext: CallbackCtx;
  cloudWatchEventsRuleName: string;
  cloudWatchEventsTargetId: string;
};

export type HandlerRequest<Model, CallbackCtx> = {
  action: HandlerAction;
  awsAccountId: string;
  bearerToken: string;
  region: string;
  requestData: RequestData<Model>;
  responseEndpoint?: string;
  stackId?: string;
  resourceType?: string;
  callbackContext?: CallbackCtx;
  nextToken?: string;
  requestContext?: RequestContext<CallbackCtx>;
};

export type CustomResourceHandler<Model, CallbackCtx> = Handler<
  HandlerRequest<Model, CallbackCtx>,
  HandlerProgressEvent<Model, CallbackCtx>
>;

export type RegisteredHandlerContext = {
  credentials?: Credentials;
  lambda: Context;
  logger: Logger;
};

export type RegisteredResourceHandler<Model, CallbackCtx = unknown> = (
  event: HandlerRequest<Model, CallbackCtx>,
  services: RegisteredHandlerContext,
) => PromiseLike<HandlerProgressEvent<Model, CallbackCtx>>;

export function makeRegisteredHandler<Model, CallbackCtx = unknown>(
  handler: RegisteredResourceHandler<Model, CallbackCtx>,
): CustomResourceHandler<Model, CallbackCtx> {
  return async (event, lambda) => {
    let logStreamName = `${event.awsAccountId}-${event.region}`;
    if (event.stackId && event.requestData.logicalResourceId) {
      const stackName = getStackNameWithId(event.stackId);
      logStreamName = `${stackName}/${event.requestData.logicalResourceId}`;
    }

    const logger = event.requestData.providerLogGroupName
      ? new BufferedCloudWatchLogger({
          create: true,
          logGroupName: event.requestData.providerLogGroupName,
          logStreamName,
          credentials: event.requestData.providerCredentials,
        })
      : new ConsoleLogger();

    if (logger) {
      if (event.requestData.callerCredentials) {
        logger.addCredentialsRedaction(event.requestData.callerCredentials);
      }
      if (event.requestData.providerCredentials) {
        logger.addCredentialsRedaction(event.requestData.providerCredentials);
      }
    }

    try {
      logger.log(`START ${event.action}`);

      return await handler(event, {
        credentials: event.requestData.callerCredentials,
        lambda,
        logger,
      });
    } catch (err) {
      logger.log(`ERROR`, err);

      return {
        status: "FAILED",
        errorCode: "InternalFailure",
        message: format(err),
      };
    } finally {
      await logger.flush();
    }
  };
}
