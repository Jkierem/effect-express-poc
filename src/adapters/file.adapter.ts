import { Context, Effect, Layer } from "effect";

export class IOError {
    readonly _tag = 'IOError';
    constructor(public which: unknown) {}
}

export interface FileAdapter {
    read: (file: string) => Effect.Effect<never, IOError, string>
}

export const FileAdapter = Context.Tag<FileAdapter>();

const files: Record<string, string> = {
    users: JSON.stringify({
        0: {
            name: "juan",
            last: "gomez"
        }
    })
}

export const FileAdapterLive = Layer.succeed(FileAdapter, FileAdapter.of({
    read(file) {
        return Effect.tryPromise({
            try: () => {
                if( files[file] ){
                    return Promise.resolve(files[file])
                }
                return Promise.reject(new Error('File not found'))
            },
            catch: (e) => new IOError(e)
        })
    },
}))