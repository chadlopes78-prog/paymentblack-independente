export const randomUUID = () => (crypto as any).randomUUID();
export const createHash = () => ({ update() { return this; }, digest() { return ''; } });
export default { randomUUID, createHash };
