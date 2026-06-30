export const Buffer = (globalThis as any).Buffer || { from: () => new Uint8Array(), isBuffer: () => false };
export default Buffer;
