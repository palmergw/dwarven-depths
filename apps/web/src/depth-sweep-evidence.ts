import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Battlefield } from "./Battlefield.js";
import type { RenderSnapshot } from "./render-snapshot.js";
import "./styles.css";

let root: Root | undefined;

export function mountDepthSweep(
  snapshot: RenderSnapshot,
  reduceMotion = true,
  evidenceEffectAlpha?: number
): void {
  const parent = document.querySelector("#depth-sweep-root");
  if (!(parent instanceof HTMLElement))
    throw new Error("missing depth sweep capture root");
  root ??= createRoot(parent);
  root.render(
    createElement(Battlefield, {
      snapshot,
      reduceMotion,
      soundEnabled: false,
      ...(evidenceEffectAlpha === undefined ? {} : { evidenceEffectAlpha })
    })
  );
}
