import { Express, Layer, pipe } from './support/express';
import { HealthRouter } from './routes/health.routes';
import { UserRouter } from './routes/user.routes';
import { FileAdapterLive } from './adapters/file.adapter';
import { HealthAdapterLive } from './adapters/health.adapter';

const program = pipe(
    Express.makeApp(),
    Express.useRouter("/health", HealthRouter),
    Express.useRouter("/user", UserRouter),
    Express.listen(3333, () => console.log("Listening on port 3333"))
)

const mainLayer = Layer.mergeAll(
    FileAdapterLive,
    HealthAdapterLive
)

Express.run(Express.provide(program, mainLayer))