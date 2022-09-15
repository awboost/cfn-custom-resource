import { hash } from '../internal/hash.js';

export const AutoPhysicalResourceIdPrefix = 'custom:';

export function makePhysicalResourceId(
  stackId: string,
  logicalId: string,
  maxLength = 1024,
  hashLength = 10,
): string {
  if (maxLength < 0) {
    throw new Error(`can't have maxLength < 0`);
  }

  const name =
    AutoPhysicalResourceIdPrefix + logicalId.replace(/[^a-zA-Z0-9-_]/g, '');
  const hashtag = '-' + hash([stackId, logicalId]).slice(0, hashLength);

  const taglessLength = maxLength - hashtag.length;
  return name.slice(0, taglessLength) + hashtag;
}
