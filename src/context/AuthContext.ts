import { createContext } from "react";
import type { MeApiResponse } from "@/lib/types";

export const AuthContext = createContext<MeApiResponse | undefined>(undefined);
