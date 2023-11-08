import { Effect, Layer, pipe } from 'effect'
import * as Express from './support/express'
import { HealthRouter } from './routes/health.routes';
import { UserRouter } from './routes/user.routes';
import { FileAdapterLive } from './adapters/file.adapter';

const program = pipe(
    Express.makeApp(),
    Express.useEffect("/health", HealthRouter),
    Express.useEffect("/user", UserRouter),
    Express.listen(3333, () => console.log("Listening on port 3333"))
)

const mainLayer = Layer.mergeAll(FileAdapterLive)

Effect.runPromise(Effect.provide(program, mainLayer))