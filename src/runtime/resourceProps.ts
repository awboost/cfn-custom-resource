import { Decoder, DecoderError, DecodingAssertError } from '@fmtk/decoders';

export function resourceProps<T>(
  decoder: Decoder<T>,
  value: unknown,
  kind = 'property',
): T {
  const result = decoder(value);
  if (!result.ok) {
    const err = new DecodingAssertError(result.error);
    const details = getErrorMessage(result.error);
    err.message = `${kind} validation failed [${details}]`;
    throw err;
  }
  return result.value;
}

function getErrorMessage(errors: DecoderError[]): string {
  return errors.map((x) => `${x.field}: ${x.text}`).join(', ');
}
