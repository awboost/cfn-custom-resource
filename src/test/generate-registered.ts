import { IAMRole } from "@awboost/cfn-resource-types/AWS-IAM-Role";
import { FileSystemAssetEmitter } from "@awboost/cfn-template-builder/emitter";
import { Stack } from "@awboost/cfn-template-builder/stack";
import { readFile } from "fs/promises";
import { makeCloudFormationResourceAssumeRolePolicyDocument } from "../policies.js";
import { RegisteredResource } from "../registered-resource.js";

const schema = JSON.parse(await readFile("test-schema.json", "utf-8"));
const stack = new Stack();

const role = stack.use(
  new IAMRole("ResourceHandlerRole", {
    AssumeRolePolicyDocument:
      makeCloudFormationResourceAssumeRolePolicyDocument(),
    ManagedPolicyArns: [
      "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    ],
  }),
);

stack.use(
  new RegisteredResource("Resource", {
    AssetPath: "./dist/bundle-registered.zip",
    TypeName: schema.typeName,
    ExecutionRoleArn: role.out.Arn,
  }),
);

const emitter = new FileSystemAssetEmitter({
  outputDirectory: "dist",
});

await stack.build(emitter, {
  templateFileName: "ResourceProviderTest.template.json",
});
