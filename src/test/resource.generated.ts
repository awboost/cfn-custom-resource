import { Resource as $Resource } from "@awboost/cfn-template-builder/template/resource";
import type { ResourceOptions as $ResourceOptions } from "@awboost/cfn-template-builder/template";
/**
 * Resource type definition for `AWBoost::Development::TestResource`.
 * An example resource schema demonstrating some basic constructs and validation rules.
 */
export type AWBoostDevelopmentTestResourceProperties = {
  /**
   * A name.
   */
  Name: string;
  /**
   * An array of key-value pairs to apply to this resource.
   */
  Tags?: Tag[];
};
/**
 * Type definition for `AWBoost::Development::TestResource.Tag`.
 * A key-value pair to associate with a resource.
 */
export type Tag = {
  /**
   * The key name of the tag. You can specify a value that is 1 to 128 Unicode characters in length and cannot be prefixed with aws:. You can use any of the following characters: the set of Unicode letters, digits, whitespace, _, ., /, =, +, and -.
   * @minLength `1`
   * @maxLength `128`
   */
  Key: string;
  /**
   * The value for the tag. You can specify a value that is 0 to 256 Unicode characters in length and cannot be prefixed with aws:. You can use any of the following characters: the set of Unicode letters, digits, whitespace, _, ., /, =, +, and -.
   * @minLength `0`
   * @maxLength `256`
   */
  Value: string;
};
/**
 * Resource type definition for `AWBoost::Development::TestResource`.
 * An example resource schema demonstrating some basic constructs and validation rules.
 */
export class AWBoostDevelopmentTestResource extends $Resource<
  "AWBoost::Development::TestResource",
  AWBoostDevelopmentTestResourceProperties,
  Record<string, never>
> {
  public static readonly Type = "AWBoost::Development::TestResource";
  constructor(
    logicalId: string,
    properties: AWBoostDevelopmentTestResourceProperties,
    options?: $ResourceOptions,
  ) {
    super(logicalId, AWBoostDevelopmentTestResource.Type, properties, options);
  }
}
