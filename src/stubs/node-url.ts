export const { URL, URLSearchParams } = globalThis;
export const fileURLToPath = (u: string) => u.replace('file://', '');
export default { URL, URLSearchParams, fileURLToPath };
