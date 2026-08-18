"use client";

import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useReducer,
} from "react";

import {
  createInitialWorldSignalState,
  type WorldSignalAction,
  type WorldSignalState,
  worldSignalReducer,
} from "./worldsignal-reducer";

const WorldSignalStateContext = createContext<WorldSignalState | undefined>(
  undefined,
);
const WorldSignalDispatchContext = createContext<
  Dispatch<WorldSignalAction> | undefined
>(undefined);

export function WorldSignalProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    worldSignalReducer,
    undefined,
    createInitialWorldSignalState,
  );

  return (
    <WorldSignalStateContext value={state}>
      <WorldSignalDispatchContext value={dispatch}>
        {children}
      </WorldSignalDispatchContext>
    </WorldSignalStateContext>
  );
}

export function useWorldSignalState(): WorldSignalState {
  const context = useContext(WorldSignalStateContext);
  if (!context) {
    throw new Error(
      "useWorldSignalState must be used inside WorldSignalProvider",
    );
  }
  return context;
}

export function useWorldSignalDispatch(): Dispatch<WorldSignalAction> {
  const context = useContext(WorldSignalDispatchContext);
  if (!context) {
    throw new Error(
      "useWorldSignalDispatch must be used inside WorldSignalProvider",
    );
  }
  return context;
}
