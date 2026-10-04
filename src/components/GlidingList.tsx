import { Children, Component, createRef, isValidElement, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = ComponentProps<"ul">;

/** An item's place in the list as laid out, and how far a glide still holds it from there. */
type Spot = { x: number; y: number; dx: number; dy: number };

/** In the side bar's time, as the page's Morphs. */
export const GLIDE = { duration: 200, easing: "cubic-bezier(0.4, 0, 0.2, 1)" };

/**
 * A list whose items glide to new places rather than jumping there: those after one that goes close up the room it leaves,
 * and those after one that arrives make room for it. Each child is one keyed element.
 */
export class GlidingList extends Component<Props> {
  private readonly list = createRef<HTMLUListElement>();
  private readonly glides = new WeakMap<Element, Animation>();

  // Taken before React changes the list, so it reads where each item stood as last drawn.
  override getSnapshotBeforeUpdate(prev: Props): Map<string, Spot> | null {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
    return new Map(this.items(prev.children).map(([key, item]) => [key, this.spot(item)]));
  }

  override componentDidUpdate(_prev: Props, _state: unknown, before: Map<string, Spot> | null) {
    if (!before) return;
    for (const [key, item] of this.items(this.props.children)) {
      const was = before.get(key);
      const { offsetLeft: x, offsetTop: y } = item;
      if (!was || (was.x === x && was.y === y)) continue;
      // From where it showed, part way through any glide it was in.
      this.glides.get(item)?.cancel();
      this.glides.set(item, item.animate({ translate: [`${was.x + was.dx - x}px ${was.y + was.dy - y}px`, "0 0"] }, GLIDE));
    }
  }

  override render() {
    // Positioned, so its items' offsets are measured from it and stay put as it moves.
    return <ul {...this.props} ref={this.list} className={cn("relative", this.props.className)} />;
  }

  /** Each child's key, with the element it drew. */
  private items(children: ReactNode): [string, HTMLElement][] {
    const elements = [...(this.list.current?.children ?? [])] as HTMLElement[];
    return Children.toArray(children).flatMap((child, i): [string, HTMLElement][] =>
      isValidElement(child) && elements[i] ? [[String(child.key), elements[i]]] : [],
    );
  }

  private spot(item: HTMLElement): Spot {
    const gliding = this.glides.get(item)?.playState === "running";
    const [dx = 0, dy = 0] = gliding ? getComputedStyle(item).translate.split(" ").map(parseFloat) : [];
    return { x: item.offsetLeft, y: item.offsetTop, dx, dy };
  }
}
