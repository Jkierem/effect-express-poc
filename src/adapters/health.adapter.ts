import { Context, Effect, Layer } from "effect";

export interface HealthAdapter {
    health: () => Effect.Effect<never, never, void>
}

export const HealthAdapter = Context.Tag<HealthAdapter>();

export const HealthAdapterLive = Layer.succeed(
    HealthAdapter,
    HealthAdapter.of({ health: () => Effect.unit })
)