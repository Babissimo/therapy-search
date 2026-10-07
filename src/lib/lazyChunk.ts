import { lazy, type ComponentType } from "react";

type Module<P> = { default: ComponentType<P> };

/**
 * A component in a chunk of its own, and the loader that fetches that chunk. Once the chunk is here, the component is drawn in
 * the render that first meets it.
 */
export function lazyChunk<P extends object>(fetch: () => Promise<ComponentType<P>>) {
  let loaded: Module<P> | undefined;
  const load = () => fetch().then((component) => (loaded = { default: component }));
  const Component = lazy(() => {
    const module = loaded;
    // lazy suspends for a render on any promise, even a settled one, but reads a thenable that calls back at once in the
    // render itself.
    return module ? ({ then: (take: (value: Module<P>) => void) => take(module) } as unknown as Promise<Module<P>>) : load();
  });
  return { Component, load };
}
