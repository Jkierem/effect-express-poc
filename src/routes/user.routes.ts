import { Express, Effect, pipe } from '../support/express'
import { FileAdapter } from '../adapters/file.adapter'

const readUser = Express.gen(function* (_) {
    const fileAdapter = yield* _(FileAdapter);
    const { response, request } = yield* _(Express.RouteContext('/:id'));
    const rawUsers = yield* _(fileAdapter.read('users'))
    const users = JSON.parse(rawUsers) as Record<string, string>;
    const user = users[request.params.id]

    if( user !== undefined ){
        response.status(200)
        response.setHeader("Content-Type", "application/json")
        response.json(JSON.stringify(user))
    } else {
        response.status(404)
        response.send("Not found")
    }
})

const readUserPipe = pipe(
    Effect.all([FileAdapter, Express.RouteContext("/:id")]),
    Effect.flatMap(([file, { response, request }]) => {
        return file.read('users').pipe(
            Effect.map(users => JSON.parse(users) as Record<string, string>),
            Effect.flatMap((users) => {
                const user = users[request.params.id];
                return Effect.if(user != undefined, {
                    onTrue: Effect.sync(() => {
                        response.status(200)
                        response.setHeader("Content-Type", "application/json")
                        response.json(JSON.stringify(user))
                    }),
                    onFalse: Effect.sync(() => {
                        response.status(404)
                        response.send("Not found")
                    })
                })
            })
        )
    })
)

const loggerMiddleware = Express.gen(function* (_){
    const { request, next } = yield* _(Express.DefaultContext)
    const { method, path } = request

    yield* _(Effect.log(`${method} ${path}`));
    yield* _(Effect.sync(next))
})

export const UserRouter = pipe(
    Express.makeRouter(),
    Express.use(loggerMiddleware),
    Express.get('/:id', readUser),
)