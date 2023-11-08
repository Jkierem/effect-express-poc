import { Effect, pipe } from 'effect'
import * as Express from '../support/express'
import { FileAdapter } from '../adapters/file.adapter'

const readUser = Effect.gen(function* (_) {
    const fileAdapter = yield* _(FileAdapter);
    const { response, request } = yield* _(Express.RouteContext('/:id'));
    const file = request.params.id === "fail" ? "fail" : 'users'
    const rawUsers = yield* _(fileAdapter.read(file))
    const users = JSON.parse(rawUsers) as Record<string, string>;
    const user = users[request.params.id]

    const onTrue = Effect.sync(() => {
        response.status(200)
        response.setHeader("Content-Type", "application/json")
        response.json(JSON.stringify(user))
    })

    const onFalse = Effect.sync(() => {
        response.status(404)
        response.send("Not found")
    });

    yield* _(Effect.if(user != undefined, {
        onTrue,
        onFalse
    }))
}).pipe(Effect.either)

export const UserRouter = pipe(
    Express.makeRouter(),
    Express.get('/:id', readUser),
    Effect.tapError(() => Effect.log("Caught an error"))
)

export const ScopedUserRouter = UserRouter.pipe(Express.scoped('/user'))