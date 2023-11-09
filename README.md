# Express - Effect POC

Integration of express using effects

There are three main parts to this solution: the app, the routing and the request handlers

### The App

Modeling the app is quite straight-forward: An Effect that creates the app with operators to register handlers to the app. This will mimmick the API express uses.

```typescript
import { Express, pipe } from './support/express'

const loggerMiddleware = (req, res, next) => {
    console.log("Received a request")
    next()
}

const program = pipe(
    Express.makeApp(),
    Express.classic.use(loggerMiddleware),
    Express.classic.get('/ping', (req, res) => res.send("PONG")),
    Express.listen(3333, () => console.log("Listening on port 3333"))
)

Express.run(program)
```

In this example, we use the "classic" handlers to mimmick the way express works normally. Some aliases are added to the express module so the consumer doesn't need to import the effect module. Such as, map, flatMap, and runApp (this is an alias of runPromise). For convenience, the Effect, Layer and pipe are re-exported from the effect library.

1. `Express.makeApp()` 

Creates an effect that succeeds with an express app

2. `Express.classic.use(handler)`

Takes an effect that creates an Express app or router and returns an effect that calls `use` with the handler supplied

3. `Express.classic.get(path, handler)`

Takes an effect that creates an Express app or router and returns an effect that calls `get` with the path and handler supplied

4. `Express.listen(port, callback)`

Takes an effect that creates an Express app and returns an effect that calls listen on the app

5. `Express.run(effect)`

Alias of Effect.runPromise


### The Router

Routers are a central feature of express. As such, this integration adds an effect to create a router and the operators work as you would expect when using express.

```ts
import { Express, pipe } from './support/express'

const loggerMiddleware = (req, res, next) => {
    console.log("Received a request")
    next()
}

const PingRouter = pipe(
    Express.makeRouter(),
    Express.classic.use(loggerMiddleware),
    Express.classic.get('/', (req, res) => res.send("PONG")),
)

const program = pipe(
    Express.makeApp(),
    Express.useEffect('/ping', PingRouter),
    Express.listen(3333, () => console.log("Listening on port 3333"))
)

Express.run(program)
```

Here we introduced two operators:

1. `Express.makeRouter(routerConfig)`

Creates an effect that succeeds with a router

2. `Express.useEffect(path, Effect<R, E, RequestHandler>)`

Takes an effect that creates an Express app or router and returns an effect that calls `use` with the result of the provided effect. This operator receives an effect that succeeds with a plain express request handler. Since a Router is the same as a Request Handler, we use this operator to bind a router to a path.

### The Request handlers

There are three ways to model a request handler

1. `Effect<R | { request, response, next }, never, Either<E, void>>`
2. `Effect<R, never, (request, response, next) => void>`
3. `(request, response, next) => Effect<R, never, void>`

This integration favors 1., allows 2. (via the `useEffect` operator) and the 3. is possible by using the classic operators. A complete example of the first approach would look like this:

```typescript
import { Express, Effect, pipe } from './support/express'

const loggerMiddleware = Express.gen(function*(_){
    const { next } = yield* _(Express.DefaultContext);

    yield* _(Effect.log("Recieved a request"))
    yield* _(Effect.sync(next))
})

const pongEffect = Express.gen(function*(_){
    const { response } = yield* _(Express.DefaultContext);

    response.send("PONG")
})

const PingRouter = pipe(
    Express.makeRouter(),
    Express.use(loggerMiddleware),
    Express.get('/', pongEffect),
)

const program = pipe(
    Express.makeApp(),
    Express.useEffect('/ping', PingRouter),
    Express.listen(3333, () => console.log("Listening on port 3333"))
)

Express.run(program)
```

Method handlers that receive effects used in this example can only recieve a single effect and may receive a third argument to make use of the result of the effect for cases where the result is needed. Since an error at this point is always fatal, the default value for the exit handler simply passes the error to express using the next function.

Using this approach, dependencies can be supplied and will be shared accross. In this repo is an example of how those dependencies could be used.