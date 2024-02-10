import { FileSystemAssetEmitter } from "@awboost/cfn-template-builder/emitter";
import { Stack } from "@awboost/cfn-template-builder/stack";
import { AWBoostDevelopmentTestResource } from "./resource.generated.js";

const stack = new Stack();

stack.use(
  new AWBoostDevelopmentTestResource("Thing1", {
    Name: "D",
  }),
);

const emitter = new FileSystemAssetEmitter({
  outputDirectory: "dist",
});

await stack.build(emitter, {
  templateFileName: "ResourceProviderTest-use.template.json",
});
