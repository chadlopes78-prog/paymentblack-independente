export const join = (...a: string[]) => a.join('/');
export const resolve = (...a: string[]) => '/' + a.join('/');
export const dirname = (p: string) => p.split('/').slice(0, -1).join('/') || '/';
export const basename = (p: string) => p.split('/').pop() || '';
export const extname = (p: string) => { const b = basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; };
export default { join, resolve, dirname, basename, extname };
