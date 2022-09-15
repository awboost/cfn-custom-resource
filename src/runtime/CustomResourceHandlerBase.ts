import { Decoder } from '@fmtk/decoders';
import {
  CloudFormationCustomResourceEvent,
  CloudFormationCustomResourceHandler,
  Context,
} from 'aws-lambda';
import { sendResponse } from '../internal/sendResponse.js';
import { makePhysicalResourceId } from './makePhysicalResourceId.js';
import { resourceProps } from './resourceProps.js';

/**
 * Base implementation for custom resource handlers.
 */
export abstract class CustomResourceHandlerBase<Props, Attribs = void> {
  protected readonly decodeProps: Decoder<Props>;
  protected readonly decodeAttributes: Decoder<Attribs> | undefined;

  private _logicalResourceId: string | undefined;
  protected get logicalResourceId(): string {
    if (!this._logicalResourceId) {
      throw new Error(`logicalResourceId has not been set`);
    }
    return this._logicalResourceId;
  }
  private set logicalResourceId(value: string) {
    this._logicalResourceId = value;
  }

  private _oldProperties: Props | undefined;
  protected get oldProperties(): Props {
    if (!this._oldProperties) {
      throw new Error(`oldProperties has not been set`);
    }
    return this._oldProperties;
  }
  private set oldProperties(value: Props) {
    this._oldProperties = value;
  }

  private _physicalResourceId: string | undefined;
  protected get physicalResourceId(): string {
    if (!this._physicalResourceId) {
      throw new Error(`physicalResourceId has not been set`);
    }
    return this._physicalResourceId;
  }
  protected set physicalResourceId(value: string) {
    this._physicalResourceId = value;
  }

  private _requestId: string | undefined;
  protected get requestId(): string {
    if (!this._requestId) {
      throw new Error(`requestId has not been set`);
    }
    return this._requestId;
  }

  private _stackId: string | undefined;
  protected get stackId(): string {
    if (!this._stackId) {
      throw new Error(`physicalResourceId has not been set`);
    }
    return this._stackId;
  }

  private _stackArn: string | undefined;
  protected get stackArn(): string {
    if (!this._stackArn) {
      throw new Error(`physicalResourceId has not been set`);
    }
    return this._stackArn;
  }
  protected set stackArn(value: string) {
    this._stackArn = value;
    this._stackId = value.split(':', 6)[5];
  }

  private _properties: Props | undefined;
  protected get properties(): Props {
    if (!this._properties) {
      throw new Error(`properties has not been set`);
    }
    return this._properties;
  }
  private set properties(value: Props) {
    this._properties = value;
  }

  protected data: Attribs | undefined;
  protected noEcho = false;
  protected reason: string | undefined;
  protected status: 'SUCCESS' | 'FAILED' | undefined;

  constructor(
    decodeProps: Decoder<Props>,
    decodeAttributes?: Decoder<Attribs>,
  ) {
    this.decodeAttributes = decodeAttributes;
    this.decodeProps = decodeProps;
  }

  public getHandler(): CloudFormationCustomResourceHandler {
    return (event, context) => this.execute(event, context);
  }

  public async execute(
    event: CloudFormationCustomResourceEvent,
    context: Context,
  ): Promise<void> {
    this._requestId = event.RequestId;

    if (event.RequestType === 'Create') {
      this.physicalResourceId = makePhysicalResourceId(
        event.StackId,
        event.LogicalResourceId,
      );
    } else {
      this.physicalResourceId = event.PhysicalResourceId;
    }

    try {
      this.stackArn = event.StackId;
      this.logicalResourceId = event.LogicalResourceId;
      this.properties = resourceProps(
        this.decodeProps,
        event.ResourceProperties,
      );

      await this.executeOverride(event, context);

      if (this.decodeAttributes && this.data) {
        this.data = resourceProps(
          this.decodeAttributes,
          this.data,
          'attribute',
        );
      }
    } catch (err: any) {
      console.log(`FAILED: %s`, err?.stack ?? `${err}`);
      this.fail(err?.message ?? `${err}`);
    }

    if (this.status !== 'FAILED') {
      try {
        await sendResponse(event.ResponseURL, {
          Data: this.data,
          LogicalResourceId: event.LogicalResourceId,
          NoEcho: this.noEcho,
          PhysicalResourceId: this.physicalResourceId,
          Reason: this.reason,
          RequestId: event.RequestId,
          StackId: event.StackId,
          Status: 'SUCCESS',
        });
        return;
      } catch (err: any) {
        console.log(`FAILED TO SEND RESPONSE: %s`, err?.stack ?? `${err}`);
        this.fail(err?.message ?? `${err}`);
      }
    }

    await sendResponse(event.ResponseURL, {
      Data: this.data,
      LogicalResourceId: event.LogicalResourceId,
      NoEcho: this.noEcho,
      PhysicalResourceId: this.physicalResourceId,
      Reason: this.reason ?? 'unknown error',
      RequestId: event.RequestId,
      StackId: event.StackId,
      Status: 'FAILED',
    });
  }

  protected async executeOverride(
    event: CloudFormationCustomResourceEvent,
    context: Context, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<void> {
    switch (event.RequestType) {
      case 'Create':
        await this.createResource();
        break;

      case 'Delete':
        await this.deleteResource();
        break;

      case 'Update':
        this.oldProperties = event.OldResourceProperties as Props;
        await this.updateResource();
        break;
    }
  }

  protected fail(reason: string): void {
    this.status = 'FAILED';
    this.reason = reason;
  }

  protected abstract createResource(): Promise<void>;

  // derived implementation is optional
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  protected async deleteResource(): Promise<void> {}

  // derived implementation is optional
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  protected async updateResource(): Promise<void> {}
}
