"use client";

import type { Client } from "bponder-client";
import { createContext, createElement, type ReactNode } from "react";

export const PonderContext = createContext<Client | undefined>(undefined);

type PonderProviderProps = {
  client: Client;
  children?: ReactNode;
};

export function PonderProvider(parameters: PonderProviderProps) {
  const { children, client } = parameters;
  return createElement(PonderContext.Provider, { value: client }, children);
}
