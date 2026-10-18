"use client";
/**
 * Stand-in for @clerk/nextjs when no Clerk keys are set (see next.config.ts).
 * Everyone is signed out, so the app runs locally without an account: no sync, no sign-in.
 */
import type { ReactNode } from "react";

export const ClerkProvider = ({ children }: { children: ReactNode; [k: string]: unknown }) => <>{children}</>;
export const Show = (_: { when: string; children?: ReactNode }) => null;
export const SignInButton = (_: { children?: ReactNode; [k: string]: unknown }) => null;
export const UserButton = (_: Record<string, unknown>) => null;
export const useAuth = () => ({ isLoaded: true, isSignedIn: false as boolean, userId: null as string | null });
export const useUser = () => ({ isLoaded: true, isSignedIn: false as boolean, user: null });
