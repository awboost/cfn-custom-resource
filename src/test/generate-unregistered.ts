import type { TemplateBuilder } from "@awboost/cfn-template-builder/builder";
import { FileSystemAssetEmitter } from "@awboost/cfn-template-builder/emitter";
import { Stack } from "@awboost/cfn-template-builder/stack";
import type { ResourceOptions } from "@awboost/cfn-template-builder/template";
import {
  Resource,
  type ResourceInstance,
} from "@awboost/cfn-template-builder/template/resource";
import { SingletonExtension } from "@awboost/cfn-template-builder/template/singleton";
import { UnregisteredResource } from "../unregistered-resource.js";
import { type AWBoostDevelopmentTestResourceProperties } from "./resource.generated.js";

class AWBoostDevelopmentTestResource extends Resource<
  "Custom::AWBoostTestResource",
  AWBoostDevelopmentTestResourceProperties,
  Record<string, never>
> {
  public static readonly Type = "Custom::AWBoostTestResource";

  public static readonly instance = new SingletonExtension(
    () =>
      new UnregisteredResource("TestResourceHandler", {
        AssetPath: "./dist/bundle-unregistered.zip",
        Handler: "index.entrypoint",
        Runtime: "nodejs20.x",
        Timeout: 300,
        TypeName: AWBoostDevelopmentTestResource.Type,
      }),
  );

  constructor(
    logicalId: string,
    properties: AWBoostDevelopmentTestResourceProperties,
    options?: ResourceOptions,
  ) {
    super(logicalId, AWBoostDevelopmentTestResource.Type, properties, options);
  }

  public override onUse(
    builder: TemplateBuilder,
  ): ResourceInstance<Record<string, never>> {
    const instance = builder.use(AWBoostDevelopmentTestResource.instance);
    (this.properties as any)["ServiceToken"] = instance.ref;
    return super.onUse(builder);
  }
}

const stack = new Stack();

stack.use(
  new AWBoostDevelopmentTestResource("Resource3", {
    Name: "Three",
  }),
);

const emitter = new FileSystemAssetEmitter({
  outputDirectory: "dist",
});

await stack.build(emitter, {
  templateFileName: "ResourceProviderTest-unregistered.template.json",
});
