import { pipe } from 'effect'
import * as Express from '../support/express'

export const HealthRouter = pipe(
    Express.makeRouter(),
    Express.classic.get("/", (_, res) => res.send("All is good in the hood")),
)