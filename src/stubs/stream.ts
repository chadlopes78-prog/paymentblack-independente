export class Readable { pipe() {} }
export class Writable { write() { return true; } }
export class PassThrough extends Writable {}
export class Transform extends Writable {}
export default { Readable, Writable, PassThrough, Transform };
