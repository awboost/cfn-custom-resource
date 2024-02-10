import { IAMRole } from "@awboost/cfn-resource-types/AWS-IAM-Role";
import {
  LambdaFunction,
  type LambdaFunctionProperties,
} from "@awboost/cfn-resource-types/AWS-Lambda-Function";
import type {
  TemplateBuilder,
  TemplateExtension,
} from "@awboost/cfn-template-builder/builder";
import { Fn } from "@awboost/cfn-template-builder/intrinsics";
import {
  makePolicyDocument,
  type PolicyStatement,
} from "@awboost/cfn-template-builder/policy";
import { AwsParam } from "@awboost/cfn-template-builder/pseudo";
import { Asset } from "@awboost/cfn-template-builder/template/asset";
import { filterTruthy } from "./internal/filter-truthy.js";
import {
  makeCloudWatchLoggingPolicy,
  makeLambdaAssumeRolePolicyDocument,
} from "./policies.js";

export type UnregisteredResourceProps = {
  AssetPath: string;
  FunctionName?: string;
  Handler: string;
  HandlerProperties?: Omit<
    LambdaFunctionProperties,
    "Code" | "Handler" | "Role" | keyof UnregisteredResourceProps
  >;
  LogGroupPrefix?: string;
  PolicyStatements?: PolicyStatement[];
  Runtime: string;
  Timeout: number;
  TypeName: string;
};

export type UnregisteredResourceInstance = {
  readonly name: string;
  readonly ref: string;
  addPolicyStatement(statement: PolicyStatement): void;
};

export class UnregisteredResource
  implements TemplateExtension<UnregisteredResourceInstance>
{
  protected readonly policyStatements: PolicyStatement[];

  constructor(
    public readonly name: string,
    public readonly properties: UnregisteredResourceProps,
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
    this.policyStatements = properties.PolicyStatements ?? [];
  }

  public onUse(builder: TemplateBuilder): UnregisteredResourceInstance {
    const asset = builder.use(
      Asset.fromFile(`${this.name}Asset`, this.properties.AssetPath),
    );

    const sanitizedTypeName = this.properties.TypeName.replace(/::/g, "-");

    const functionName =
      this.properties.FunctionName ??
      Fn.join$`${AwsParam.StackName}-${sanitizedTypeName}`;

    const logGroupName =
      (this.properties.LogGroupPrefix ?? "/custom-resources/") +
      sanitizedTypeName;

    const executionRole = builder.use(
      new IAMRole(`${this.name}LogRole`, {
        AssumeRolePolicyDocument: makeLambdaAssumeRolePolicyDocument(),
        Policies: filterTruthy([
          makeCloudWatchLoggingPolicy(Fn.join$`/aws/lambda/${functionName}`),
          makeCloudWatchLoggingPolicy(logGroupName, "WriteResourceLogs"),
          this.policyStatements.length && {
            PolicyName: "ExecutionRoleInline",
            PolicyDocument: makePolicyDocument(this.policyStatements),
          },
        ]),
      }),
    );

    const handler = builder.use(
      new LambdaFunction(`${this.name}Handler`, {
        ...this.properties.HandlerProperties,
        Code: asset.ref,
        FunctionName: functionName,
        Handler: this.properties.Handler,
        Role: executionRole.out.Arn,
        Runtime: this.properties.Runtime,
        Timeout: this.properties.Timeout,
      }),
    );

    return {
      name: this.properties.TypeName,
      ref: handler.out.Arn,

      addPolicyStatement: (statement): void => {
        this.policyStatements.push(statement);
      },
    };
  }
}
