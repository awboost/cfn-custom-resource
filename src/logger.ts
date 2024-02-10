import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  ResourceAlreadyExistsException,
  ResourceNotFoundException,
  type CreateLogGroupRequest,
  type InputLogEvent,
} from "@aws-sdk/client-cloudwatch-logs";
import type { Credentials } from "aws-lambda";
import { formatWithOptions, type InspectOptions } from "util";

export type LogFilter = (input: string) => string;

export type BufferedCloudWatchLoggerConfig = {
  create?: boolean;
  createLogGroup?: boolean;
  createLogGroupOptions?: Omit<CreateLogGroupRequest, "logGroupName">;
  createLogStream?: boolean;
  credentials?: Credentials;
  fallbackToConsole?: boolean;
  filters?: LogFilter[];
  inspectOptions?: InspectOptions;
  interval?: number;
  logGroupName: string;
  logStreamName: string;
};

type NormalizedConfig = {
  createLogGroupOptions: CreateLogGroupRequest | undefined;
  createLogStream: boolean;
  credentials: Credentials | undefined;
  fallbackToConsole: boolean;
  interval: number;
  logGroupName: string;
  logStreamName: string;
};

const MAX_SIZE = 1048576;
const MAX_EVENTS = 10000;

export type Logger = {
  addCredentialsRedaction(credentials: Credentials, replacement?: string): void;
  addFilter(filter: LogFilter): void;
  addRedaction(value: string, replacement?: string): void;
  log(message: string, ...args: any[]): void;
  flush(): Promise<void>;
};

export type LoggerBaseConfig = {
  filters?: LogFilter[];
  inspectOptions?: InspectOptions;
};

export abstract class LoggerBase implements Logger {
  private readonly filters: LogFilter[];
  private readonly inspectOptions: InspectOptions;

  constructor(config?: LoggerBaseConfig) {
    this.filters = config?.filters ?? [];
    this.inspectOptions = config?.inspectOptions ?? {};
  }

  public addCredentialsRedaction(
    credentials: Credentials,
    replacement = "<REDACTED>",
  ): void {
    for (const value of Object.values(credentials)) {
      if (value && typeof value === "string") {
        this.addRedaction(value, replacement);
      }
    }
  }

  public addFilter(filter: LogFilter): void {
    this.filters.push(filter);
  }

  public addRedaction(value: string, replacement = "<REDACTED>"): void {
    this.filters.push((input) => input.replaceAll(value, replacement));
  }

  public log(message: string, ...args: any[]): void {
    let formatted = formatWithOptions(this.inspectOptions, message, ...args);
    for (const filter of this.filters) {
      formatted = filter(formatted);
    }
    this.logInternal(formatted);
  }

  protected abstract logInternal(message: string): void;

  public async flush(): Promise<void> {}
}

export class BufferedCloudWatchLogger extends LoggerBase {
  private readonly buffer: InputLogEvent[] = [];
  private readonly client: CloudWatchLogsClient;
  private readonly config: NormalizedConfig;

  private size = 0;
  private timeout: NodeJS.Timeout | undefined;

  constructor(config: BufferedCloudWatchLoggerConfig) {
    super(config);
    this.client = new CloudWatchLogsClient({ credentials: config.credentials });

    const createLogGroupOptions =
      config.create || config.createLogGroup || config.createLogGroupOptions
        ? ({
            ...config.createLogGroupOptions,
            logGroupName: config.logGroupName,
          } satisfies CreateLogGroupRequest)
        : undefined;

    this.config = {
      logGroupName: config.logGroupName,
      logStreamName: config.logStreamName,
      createLogGroupOptions,
      createLogStream: config.create || !!config.createLogStream,
      credentials: config.credentials,
      fallbackToConsole: !!config.fallbackToConsole,
      interval: config.interval ?? 1000,
    };
  }

  public put(message: InputLogEvent): void {
    if (!message.message) {
      // don't log empty events
      return;
    }
    // see https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_PutLogEvents.html
    const size = Buffer.byteLength(message.message) + 26;
    if (size > 256000) {
      console.error(`invalid log event size %d`, size);
      return;
    }
    if (this.size + size > MAX_SIZE || this.buffer.length > MAX_EVENTS) {
      void this.flush();
    }

    this.size += size;
    this.buffer.push(message);

    if (!this.timeout) {
      this.timeout = setTimeout(() => void this.flush(), this.config.interval);
    }
  }

  public putBatch(messages: InputLogEvent[]): void {
    for (const message of messages) {
      this.put(message);
    }
  }

  public override async flush(): Promise<void> {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }

    const batch = this.buffer.splice(0, this.buffer.length);
    if (batch.length === 0) {
      return;
    }

    this.size = 0;

    try {
      await this.sendLogs(batch, true);
    } catch (err) {
      // not a lot we can do here but log to the console
      console.error(`ERROR writing to CloudWatch failed`, err);

      if (this.config.fallbackToConsole) {
        for (const item of batch) {
          console.log(item);
        }
      }
    }
  }
  protected override logInternal(message: string): void {
    this.put({ message, timestamp: Date.now() });
  }

  private async sendLogs(batch: InputLogEvent[], init: boolean): Promise<void> {
    try {
      // send the logs optimistically and deal with the error if the group or
      // stream doesn't exist
      await this.client.send(
        new PutLogEventsCommand({
          logGroupName: this.config.logGroupName,
          logStreamName: this.config.logStreamName,
          logEvents: batch,
        }),
      );
    } catch (err) {
      if (init && err instanceof ResourceNotFoundException) {
        // either the log group or the stream didn't exist
        if (await this.initialize()) {
          return this.sendLogs(batch, false);
        }
      }
      throw err;
    }
  }

  private async initialize(): Promise<boolean> {
    let created = false;

    if (this.config.createLogGroupOptions) {
      try {
        await this.client.send(
          new CreateLogGroupCommand(this.config.createLogGroupOptions),
        );
        created = true;
      } catch (err) {
        if (!(err instanceof ResourceAlreadyExistsException)) {
          throw err;
        }
      }
    }
    if (this.config.createLogStream) {
      try {
        await this.client.send(
          new CreateLogStreamCommand({
            logGroupName: this.config.logGroupName,
            logStreamName: this.config.logStreamName,
          }),
        );
        created = true;
      } catch (err) {
        if (!(err instanceof ResourceAlreadyExistsException)) {
          throw err;
        }
      }
    }
    return created;
  }
}

export class ConsoleLogger extends LoggerBase {
  protected override logInternal(message: string): void {
    console.log(message);
  }
}
