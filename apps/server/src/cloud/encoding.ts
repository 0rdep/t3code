export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function stringToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
