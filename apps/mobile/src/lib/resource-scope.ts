import { createContext } from "react";
import type { ApiClient } from "./api-client";
export const ResourceScope = createContext<ApiClient | null>(null);
