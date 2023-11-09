import { HealthAdapter } from '../adapters/health.adapter'
import { Express, pipe } from '../support/express'

const ping = Express.gen(function*(_){
    const health = yield* _(HealthAdapter);
    const { response } = yield* _(Express.DefaultContext)

    yield* _(health.health())

    response.send("ping")
})

export const HealthRouter = pipe(
    Express.makeRouter(),
    Express.classic.get("/classic", (_, res) => res.send("All is good in the hood")),
    Express.get('/effect', ping)
)