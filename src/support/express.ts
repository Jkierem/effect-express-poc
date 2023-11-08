import express from 'express'
import type { Express, Request, Response, RequestHandler, Router, NextFunction } from 'express'
import { Context, Effect, Either, pipe } from 'effect'

export const Methods = [
    "checkout", "copy", "delete", "get", "head",
    "lock", "merge", "mkactivity", "mkcol", "move",
    "m-search", "notify", "options", "patch", "post",
    "purge", "put", "report", "search", "subscribe", 
    "trace", "unlock", "unsubscribe"
] as const

export type Method = typeof Methods[number]

type UnaryOperator = <R,E,A extends Express | Router>(eff: Effect.Effect<R,E,A>) => Effect.Effect<R,E,A>

type BinaryOperator<R0,E0> = <R,E,A extends Express | Router>(eff: Effect.Effect<R,E,A>) => Effect.Effect<R | R0, E | E0, A>

type ExpressEffect<R=never, E=never> = Effect.Effect<R, E, Express>
export const makeApp = (): ExpressEffect => Effect.sync(() => express())

type RouterEffect<R,E> = Effect.Effect<R, E, Router>
export const makeRouter = (options?: express.RouterOptions) => Effect.sync(() => express.Router(options))

export const map = Effect.map

export const flatMap = Effect.flatMap

export function use<T>(path: string, ...handlers: RequestHandler<T>[]): UnaryOperator
export function use<T>(...handlers: RequestHandler<T>[]): UnaryOperator
export function use(...handlers: any[]){
    return map((app: Express) => app.use(...handlers))
}

type Scoped<R,E,A> = [path: string, effect: Effect.Effect<R,E,A | A[]>]
type Unscoped<R,E,A> = [effect: Effect.Effect<R,E,A | A[]>]
type EffectParams<R,E,A extends RequestHandler<any>> = Scoped<R,E,A> | Unscoped<R,E,A>
const isScoped = <R,E,A extends RequestHandler<any>>(params: EffectParams<R,E,A>): params is Scoped<R,E,A> => params.length === 2

export function useEffect<R,E,T extends RequestHandler<any>>(path: string, eff: Effect.Effect<R,E,T>): BinaryOperator<R, E>
export function useEffect<R,E,T extends RequestHandler<any>>(eff: Effect.Effect<R,E,T>): BinaryOperator<R, E>
export function useEffect<R,E,T extends RequestHandler<any>>(...args: EffectParams<R,E,T>){
    let effect: Effect.Effect<R,E,T | T[]>;
    let path: string | undefined;
    if( isScoped(args) ){
        path = args[0]
        effect = args[1]
    } else {
        effect = args[0]
    }
    return flatMap((app: Express) => {
        return effect.pipe(map((rawHandlers) => {
            const handlers = Array.isArray(rawHandlers) ? rawHandlers : [rawHandlers]
            return path === undefined 
                ? app.use(...handlers) 
                : app.use(path, ...handlers)
        }))
    })
}


export const listen = (port: number, cb: () => void) => map((app: Express) => app.listen(port, cb))

type MethodHandler = (path: string, ...handlers: RequestHandler[]) => UnaryOperator

const makeClassicMethod = (method: Lowercase<Method>): MethodHandler => (
    path: string, 
    ...handlers:  RequestHandler[]
): UnaryOperator => map((app) => (app as any)[method](path, ...handlers))

export const classic = Methods.reduce((rec, next) => {
    return {
        ...rec,
        [next]: makeClassicMethod(next)
    }
},{} as Record<Lowercase<Method>, MethodHandler>)

type ParamKeys<T> = T extends `${string}:${infer R}`
    ? R extends `${infer P}/${infer L}`
        ? P | ParamKeys<L>
        : R
    : never

export type ParamRecord<T extends string> = Record<ParamKeys<T>, string>

export type PathBoundRequest<Path extends string> = Request<ParamRecord<Path>>

export const effect = <R,E, const Path extends string>(
    method: Lowercase<Method>, 
    path: Path, 
    effect: Effect.Effect<R, E, RequestHandler<ParamRecord<Path>>>
) => <R,E,A extends Router | Express>(self: Effect.Effect<R,E,A>) => {
    return pipe(
        Effect.Do,
        Effect.bind('app', () => self),
        Effect.bind('handler', () => effect),
        Effect.map(({ app, handler }) => (app as any)[method](path, handler))
    )
}

export interface HandlerContext<
    Path extends string, 
    ResBody = any, 
    ReqBody = any,
> {
    response: Response<ResBody>
    request: Request<ParamRecord<Path>, ResBody, ReqBody>
    next: NextFunction
}

export const HandlerContext = Context.Tag<HandlerContext<any>>();

export const RouteContext = <T extends string>(_path: T) => HandlerContext as Context.Tag<HandlerContext<T>, HandlerContext<T>>;

export type EffectRequestHandler<R, E, Path extends string> = Effect.Effect<R | HandlerContext<Path>, never, Either.Either<E, void>>

export const withContext = <R,E,const Path extends string>(
    method: Lowercase<Method>,
    path: Path,
    effect: EffectRequestHandler<R, E, Path>,
    onFinish: (result: Either.Either<E, void>) => void = () => void 0
) => <R0, E0, A extends Express | Router>(self: Effect.Effect<R0, E0, A>) => {
    return pipe(
        Effect.context<R>(),
        Effect.flatMap((ctx) => {
            return pipe(
                self,
                Effect.tap((app) => {
                    return Effect.sync(() => {
                        (app as any)[method](path, (request: Request, response: Response, next: NextFunction) => {
                            const handlerCtx = HandlerContext.of({ request, response, next})
                            return effect
                                .pipe(Effect.provideService(HandlerContext, handlerCtx))
                                .pipe(Effect.provide(ctx))
                                .pipe(Effect.map(onFinish))
                                .pipe(Effect.runPromise)
                        })
                    })
                })
            )
        })
    )
}


const makeMethod = (method: Method) => <
    R,
    E,
    const Path extends string
>(
    path: Path,
    effect: EffectRequestHandler<R,E,Path>,
    onFinish: (result: Either.Either<E, void>) => void = () => void 0
) => withContext(method, path, effect, onFinish);

export const get = makeMethod('get')
export const post = makeMethod('post')
export const put = makeMethod('put')
export const options = makeMethod('options')
export const patch = makeMethod('patch')
export const checkout = makeMethod('checkout')
export const copy = makeMethod('copy')
export const head = makeMethod('head')
export const lock = makeMethod('lock')
export const merge = makeMethod('merge')
export const mkactivity = makeMethod('mkactivity')
export const mkcol = makeMethod('mkcol')
export const move = makeMethod('move')
export const msearch = makeMethod('m-search')
export const notify = makeMethod('notify')
export const purge = makeMethod('purge')
export const report = makeMethod('report')
export const search = makeMethod('search')
export const subscribe = makeMethod('subscribe')
export const trace = makeMethod('trace')
export const unlock = makeMethod('unlock')
export const unsubscribe = makeMethod('unsubscribe')

const delete_ = makeMethod('delete')
export { delete_ as delete }

export interface ScopedRouter<Route extends string,R,E> {
    path: Route
    router: Effect.Effect<R, E, Router>
}

export const useScopedRouter = <Route extends string,R,E>(service: ScopedRouter<Route,R,E>) => useEffect(service.path, service.router);

export const scoped = <const T extends string>(path: T) => <R,E>(router: RouterEffect<R,E>): ScopedRouter<T,R,E> => ({
    path,
    router
})

