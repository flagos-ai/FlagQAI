/** Workspace-confined file access over a native filesystem service. */
import { realpath, stat as diskStat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
export async function createWorkspaceFileScope(fs, cwd) {
    if (!fs || !isAbsolute(cwd))
        throw new Error('Workspace files are unavailable');
    const root = await realpath(cwd);
    const check = async (path) => {
        const actual = await realpath(resolve(cwd, path));
        const local = relative(root, actual);
        if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local))
            throw new Error('File is outside this workspace');
        if (local.split(sep).some(part => part === '.git' || part === '.env' || part.startsWith('.env.')))
            throw new Error('This file cannot be attached from Web');
        return actual;
    };
    const checked = async (target) => fs.resolve(await check(target.displayPath));
    return {
        resolve: async (path) => fs.resolve(await check(path)),
        stat: async (target) => fs.stat(await checked(target)),
        readText: async (target) => {
            const actual = await check(target.displayPath);
            if ((await diskStat(actual)).size > 512 * 1024)
                throw new Error('File exceeds the Web preview limit');
            return fs.readText(await fs.resolve(actual));
        },
        readBytes: fs.readBytes === undefined ? undefined : async (target, signal, maxBytes) => fs.readBytes(await checked(target), signal, maxBytes),
        listDir: async (target) => (await fs.listDir(await checked(target))).filter(item => item.name !== '.git' && item.name !== '.env' && !item.name.startsWith('.env.')),
    };
}
