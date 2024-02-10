import { type Policy } from "@awboost/cfn-resource-types/AWS-IAM-Role";
import { Fn } from "@awboost/cfn-template-builder/intrinsics";
import {
  makePolicyDocument,
  type PolicyDocument,
} from "@awboost/cfn-template-builder/policy";
import { localArn } from "@awboost/cfn-template-builder/util/arn";

function makeAssumeRolePolicyDocument(...services: string[]): PolicyDocument {
  return makePolicyDocument([
    {
      Effect: "Allow",
      Principal: { Service: services },
      Action: "sts:AssumeRole",
    },
  ]);
}

export function makeLambdaAssumeRolePolicyDocument(): PolicyDocument {
  return makeAssumeRolePolicyDocument("lambda.amazonaws.com");
}

export function makeCloudFormationResourceAssumeRolePolicyDocument(): PolicyDocument {
  return makeAssumeRolePolicyDocument(
    "hooks.cloudformation.amazonaws.com",
    "resources.cloudformation.amazonaws.com",
  );
}

export function makeCloudWatchLoggingPolicy(
  logGroupName: string,
  policyName = "WriteLogs",
): Policy {
  return {
    PolicyName: policyName,
    PolicyDocument: makePolicyDocument([
      {
        Effect: "Allow",
        Action: [
          "logs:CreateLogGroup",
          "logs:DescribeLogStreams",
          "logs:PutRetentionPolicy",
        ],
        Resource: localArn("logs", Fn.join$`log-group:${logGroupName}`),
      },
      {
        Effect: "Allow",
        Action: [
          // it appears to be necessary to have logs:CreateLogGroup with a
          // log-stream rather than log-group ARN, otherwise it fails with an
          // error message which includes an ARN with `:log-stream:` at the end
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        Resource: localArn(
          "logs",
          Fn.join$`log-group:${logGroupName}:log-stream:*`,
        ),
      },
    ]),
  };
}
