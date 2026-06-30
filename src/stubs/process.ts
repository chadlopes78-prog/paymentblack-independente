const _proc = (globalThis as any).process || {};
export default _proc;
export const env = _proc.env || {};
export const platform = 'browser';
export const argv: string[] = [];
