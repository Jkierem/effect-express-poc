import { Effect, pipe } from 'effect'
import * as Express from '../support/express'
import { FileAdapter } from '../adapters/file.adapter'
import type { NextFunction, Response } from 'express'

const readUser = pipe(
    FileAdapter,
    Effect.flatMap((adapter) => adapter.read('users')),
    Effect.map(data => JSON.parse(data) as Record<string, { name: string, last: string }>),
    Effect.map((users) => {
        return (req: Express.PathBoundRequest<'/main/:id'>, res: Response, next: NextFunction) => {
            const userId = req.params.id;
            const user = users[userId]
            if( user ){
                res.status(200);
                res.setHeader("Content-Type", "application/json");
                res.json(JSON.stringify(user));
            } else {
                res.status(404);
                res.send("Not found")
            }
        } 
    })
)

const readUserAlt = Effect.gen(function*(_){
    const fileAdapter = yield* _(FileAdapter);
    const { response, request } = yield* _(Express.RouteContext('/alt/:id'));
    const file = request.params.id === "fail" ? "fail" : 'users'
    const rawUsers = yield* _(fileAdapter.read(file))
    const users = JSON.parse(rawUsers) as Record<string, string>;
    const user = users[request.params.id]
    if( user ){
        response.status(200);
        response.setHeader("Content-Type", "application/json");
        response.json(JSON.stringify(user));
    } else {
        response.status(404);
        response.send("Not found")
    }
})

export const UserRouter = pipe(
    Express.makeRouter(),
    Express.effect('get', '/main/:id', readUser),
    Express.effectWithContext('get', '/alt/:id', readUserAlt),
    Effect.tapError((err) => Effect.log("Caught an error"))
)

export const ScopedUserRouter = UserRouter.pipe(Express.scoped('/user'))