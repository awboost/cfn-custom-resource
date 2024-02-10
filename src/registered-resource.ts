import { CloudFormationResourceDefaultVersion } from "@awboost/cfn-resource-types/AWS-CloudFormation-ResourceDefaultVersion";
import { CloudFormationResourceVersion } from "@awboost/cfn-resource-types/AWS-CloudFormation-ResourceVersion";
import { IAMRole } from "@awboost/cfn-resource-types/AWS-IAM-Role";
import type {
  TemplateBuilder,
  TemplateExtension,
} from "@awboost/cfn-template-builder/builder";
import { Fn } from "@awboost/cfn-template-builder/intrinsics";
import { Asset } from "@awboost/cfn-template-builder/template/asset";
import {
  makeCloudFormationResourceAssumeRolePolicyDocument,
  makeCloudWatchLoggingPolicy,
} from "./policies.js";

export type RegisteredResourceProps = {
  AssetPath: string;
  ExecutionRoleArn?: string;
  LogGroupPrefix?: string;
  TypeName: string;
};

export class RegisteredResource implements TemplateExtension {
  constructor(
    public readonly name: string,
    public readonly properties: RegisteredResourceProps,
  ) {
    // check that the properties aren't intrinsic functions
    if (typeof properties.AssetPath !== "string") {
      throw new TypeError(`AssetPath must be compile-time string`);
    }
    if (
      properties.LogGroupPrefix &&
      typeof properties.LogGroupPrefix !== "string"
    ) {
      throw new TypeError(`LogPathPrefix must be compile-time string`);
    }
    if (typeof properties.TypeName !== "string") {
      throw new TypeError(`TypeName must be compile-time string`);
    }
  }

  public onUse(builder: TemplateBuilder): void {
    const asset = builder.use(
      Asset.fromFile(`${this.name}Asset`, this.properties.AssetPath),
    );

    const logGroupPrefix =
      this.properties.LogGroupPrefix ?? "/custom-resources/";

    const logGroupBasename = this.properties.TypeName.replace(/::/g, "-");
    const logGroupName = logGroupPrefix + logGroupBasename;

    const logRole = builder.use(
      new IAMRole(`${this.name}LogRole`, {
        AssumeRolePolicyDocument:
          makeCloudFormationResourceAssumeRolePolicyDocument(),
        Policies: [makeCloudWatchLoggingPolicy(logGroupName)],
      }),
    );

    const resourceVersion = builder.use(
      new CloudFormationResourceVersion(`${this.name}Version`, {
        TypeName: this.properties.TypeName,
        SchemaHandlerPackage: Fn.join$`s3://${asset.ref.S3Bucket}/${asset.ref.S3Key}`,
        ExecutionRoleArn: this.properties.ExecutionRoleArn,
        LoggingConfig: {
          LogGroupName: logGroupName,
          LogRoleArn: logRole.out.Arn,
        },
      }),
    );

    builder.use(
      new CloudFormationResourceDefaultVersion(`${this.name}DefaultVersion`, {
        TypeVersionArn: resourceVersion.out.Arn,
      }),
    );
  }
}
