import express from 'express'
import type * as E from 'express'
import { Context, Effect, Either, pipe } from 'effect'

const Methods = [
    "checkout", "copy", "delete", "get", "head",
    "lock", "merge", "mkactivity", "mkcol", "move",
    "m-search", "notify", "options", "patch", "post",
    "purge", "put", "report", "search", "subscribe", 
    "trace", "unlock", "unsubscribe", "all"
] as const

export type Method = typeof Methods[number]

export type UnaryOperator = <R,E,A extends E.Express | E.Router>(eff: Effect.Effect<R,E,A>) => Effect.Effect<R,E,A>

export type BinaryOperator<R0,E0> = <R,E,A extends E.Express | E.Router>(eff: Effect.Effect<R,E,A>) => Effect.Effect<R | R0, E | E0, A>

export type ExpressEffect<R=never, E=never> = Effect.Effect<R, E, E.Express>

export type EffectRequestHandler<R, E, Path extends string> = Effect.Effect<R | HandlerContext<Path>, never, Either.Either<E, void>>

export type ExitHandler<E, Path extends string> = (result: Either.Either<E, void>, handlerContext: HandlerContext<Path>) => void

export declare module Express {
    export type Express<R=never, E=never> = ExpressEffect<R,E>
    export type Router<R=never, E=never> = Effect.Effect<R,E,E.Router>
    export type RequestHandler<R, E, Path extends string> = EffectRequestHandler<R, E, Path>
    export type ExitHandler<E, Path extends string> = (result: Either.Either<E, void>, handlerContext: HandlerContext<Path>) => void
}

const makeApp = (): ExpressEffect => Effect.sync(() => express())

const makeRouter = (options?: express.RouterOptions) => Effect.sync(() => express.Router(options))

const map = Effect.map

const flatMap = Effect.flatMap

type Scoped<R,E,A> = [path: string, effect: Effect.Effect<R,E,A | A[]>]
type Unscoped<R,E,A> = [effect: Effect.Effect<R,E,A | A[]>]
type EffectParams<R,E,A extends E.RequestHandler<any>> = Scoped<R,E,A> | Unscoped<R,E,A>
const isScoped = <R,E,A extends E.RequestHandler<any>>(params: EffectParams<R,E,A>): params is Scoped<R,E,A> => params.length === 2

function useEffect<R,E,T extends E.RequestHandler<any>>(path: string, eff: Effect.Effect<R,E,T>): BinaryOperator<R, E>
function useEffect<R,E,T extends E.RequestHandler<any>>(eff: Effect.Effect<R,E,T>): BinaryOperator<R, E>
function useEffect<R,E,T extends E.RequestHandler<any>>(...args: EffectParams<R,E,T>){
    let effect: Effect.Effect<R,E,T | T[]>;
    let path: string | undefined;
    if( isScoped(args) ){
        path = args[0]
        effect = args[1]
    } else {
        effect = args[0]
    }
    return flatMap((app: E.Express) => {
        return effect.pipe(map((rawHandlers) => {
            const handlers = Array.isArray(rawHandlers) ? rawHandlers : [rawHandlers]
            return path === undefined 
                ? app.use(...handlers) 
                : app.use(path, ...handlers)
        }))
    })
}

const listen = (port: number, cb: () => void) => map((app: E.Express) => app.listen(port, cb))

type MethodHandler = (path: string, ...handlers: E.RequestHandler[]) => UnaryOperator

const makeClassicMethod = (method: Lowercase<Method>): MethodHandler => (
    path: string, 
    ...handlers:  E.RequestHandler[]
): UnaryOperator => map((app) => (app as any)[method](path, ...handlers))

function classicUse<T>(path: string, ...handlers: E.RequestHandler<T>[]): UnaryOperator
function classicUse<T>(...handlers: E.RequestHandler<T>[]): UnaryOperator
function classicUse(...handlers: any[]){
    return map((app: E.Express) => app.use(...handlers))
}

const classic = Methods.reduce((rec, next) => {
    return {
        ...rec,
        [next]: makeClassicMethod(next)
    }
},{
    use: classicUse
} as Record<Lowercase<Method>, MethodHandler> & { use: typeof classicUse })

type ParamKeys<T> = T extends `${string}:${infer R}`
    ? R extends `${infer P}/${infer L}`
        ? P | ParamKeys<L>
        : R
    : never

type ParamRecord<T extends string> = Record<ParamKeys<T>, string>

export type PathBoundRequest<Path extends string> = E.Request<ParamRecord<Path>>

const effect = <R,E, const Path extends string>(
    method: Lowercase<Method>, 
    path: Path, 
    effect: Effect.Effect<R, E, E.RequestHandler<ParamRecord<Path>>>
) => <R,E,A extends E.Router | E.Express>(self: Effect.Effect<R,E,A>) => {
    return pipe(
        Effect.Do,
        Effect.bind('app', () => self),
        Effect.bind('handler', () => effect),
        Effect.map(({ app, handler }) => (app as any)[method](path, handler))
    )
}

export interface HandlerContext<
    Path extends string = '/', 
    ResBody = any, 
    ReqBody = any,
> {
    response: E.Response<ResBody>
    request: E.Request<ParamRecord<Path>, ResBody, ReqBody>
    next: E.NextFunction
}

const HandlerContext = Context.Tag<HandlerContext>();

export interface DefaultContext extends HandlerContext {}

const DefaultContext = HandlerContext as Context.Tag<DefaultContext, DefaultContext>;

const RouteContext = <T extends string>(_path: T) => HandlerContext as unknown as Context.Tag<HandlerContext<T>, HandlerContext<T>>;

const defaultExitHandler = <E>(result: Either.Either<E, void>, handlerContext: HandlerContext) => {
    return result.pipe(Either.mapLeft<E, void>(handlerContext.next))
}

const withContext = <R,E,const Path extends string>(
    method: Lowercase<Method>,
    path: Path,
    effect: EffectRequestHandler<R, E, Path>,
    onExit: ExitHandler<E, Path> = defaultExitHandler
) => <R0, E0, A extends E.Express | E.Router>(self: Effect.Effect<R0, E0, A>) => {
    return Effect.gen(function* (_){
        const ctx = yield* _(Effect.context<R>());
        const app = yield* _(self);

        (app as any)[method](path, (request: E.Request, response: E.Response, next: E.NextFunction) => {
            const handlerCtx = HandlerContext.of({ request, response, next}) as HandlerContext<Path>
            return effect
                .pipe(Effect.provideService(HandlerContext, handlerCtx))
                .pipe(Effect.provide(ctx))
                .pipe(Effect.tap(result => Effect.sync(() => onExit(result, handlerCtx))))
                .pipe(Effect.runPromise)
        })

        return app
    })
}

type ScopedUse<R,E,Path extends string> = [path: Path, effect: EffectRequestHandler<R,E,Path>, onExit?: ExitHandler<E, Path>]
type UnscopedUse<R,E> = [effect: EffectRequestHandler<R,E,'/'>, onExit?: ExitHandler<E, '/'>]
type UseParams<R,E,Path extends string> = ScopedUse<R,E,Path> | UnscopedUse<R,E>
const isScopedUse = <R,E,Path extends string>(params: UseParams<R,E,Path>): params is ScopedUse<R,E,Path> => typeof params[0] === 'string'

function use<R,E>(handler: EffectRequestHandler<R,E,'/'>, onExit?: ExitHandler<E, '/'>): UnaryOperator
function use<R,E,const Path extends string>(path: Path, handler: EffectRequestHandler<R,E,Path>, onExit?: ExitHandler<E, Path>): UnaryOperator
function use<R,E,const Path extends string>(...args: UseParams<R,E,Path>) {
    let effect: EffectRequestHandler<R,E,Path>;
    let onExit: ExitHandler<E, Path>;
    let path: Path | undefined;
    if( isScopedUse(args) ){
        path = args[0]
        effect = args[1]
        onExit = args[2] ?? defaultExitHandler
    } else {;
        effect = args[0] as EffectRequestHandler<R,E,Path>;
        onExit = args[1] ?? defaultExitHandler
    }
    return (<R0, E0, A extends express.Express | express.Router>(self: Effect.Effect<R0, E0, A>) => {
        return Effect.gen(function*(_){
            const ctx = yield* _(Effect.context<R>());
            const app = yield* _(self);

            const handler = (
                request: E.Request, 
                response: E.Response, 
                next: E.NextFunction
            ) => {
                const handlerCtx = HandlerContext.of({ request, response, next}) as HandlerContext<Path>
                return effect
                    .pipe(Effect.provideService(HandlerContext, handlerCtx))
                    .pipe(Effect.provide(ctx))
                    .pipe(Effect.tap(result => Effect.sync(() => onExit(result, handlerCtx))))
                    .pipe(Effect.runPromise)
            }

            return path === undefined 
                ? app.use(handler) 
                : (app as E.Express).use(path, handler);
        })
    }) as UnaryOperator
}

export type EffectMethodHandler = <
    R,E,const Path extends string
>(path: Path, effect: EffectRequestHandler<R,E,Path>, onExit?: ExitHandler<E, Path>) => UnaryOperator

const makeMethod = (method: Method) => <
    R,
    E,
    const Path extends string
>(
    path: Path,
    effect: EffectRequestHandler<R,E,Path>,
    onExit: ExitHandler<E,Path> = defaultExitHandler
) => withContext(method, path, effect, onExit);

const effectMethodHandlers = Methods.reduce((acc, next) => {
    return {
        ...acc,
        [next]: makeMethod(next)
    }
},{} as Record<Method, EffectMethodHandler>)

/**
 * Similar to Effect.gen but moves the error to the success channel via Effect.either
 */
const gen = <
    Eff extends Effect.EffectGen<any, any, any>
>(f: (resume: Effect.Adapter) => Generator<Eff, void, any>) => pipe(
    Effect.gen(f),
    Effect.either
)

export const ExpressModule = {
    classic,
    ...effectMethodHandlers,

    use,
    useEffect,
    withContext,
    effect,

    gen,
    listen,
    makeApp,
    makeRouter,
    provide: Effect.provide,
    run: Effect.runPromise,

    HandlerContext,
    RouteContext,
    DefaultContext,

    defaultExitHandler
}

export { ExpressModule as Express }
export { Layer, Effect } from 'effect';
export { pipe }