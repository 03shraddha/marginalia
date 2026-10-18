/** Server half of the Clerk stand-in: nobody is signed in, and the proxy passes every request through. */
import { NextResponse } from "next/server";

export const auth = async () => ({ userId: null as string | null });
export const clerkMiddleware = () => () => NextResponse.next();
