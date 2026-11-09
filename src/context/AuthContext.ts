import { createContext } from "react";
import type { Me } from "@/lib/queries";

export const AuthContext = createContext<Me | undefined>(undefined);
