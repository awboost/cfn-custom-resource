export function getStackNameWithId(stackId: string): string {
  const match = /^arn:aws:cloudformation:.*:stack\/(.+)$/.exec(stackId);
  if (!match) {
    return stackId.replace(/:/g, "-");
  }
  return match[1];
}
