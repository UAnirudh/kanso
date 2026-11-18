import { NextResponse } from "next/server";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE,
  isDeviceId,
  newDeviceId,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The only route that writes the device cookie. Server Components cannot set
 * cookies while rendering, so `/` and every guarded page redirect a cookieless
 * browser here, and the response carries the identity forward.
 */
export function GET(request: Request) {
  const header = request.headers.get("cookie") ?? "";
  const current = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DEVICE_COOKIE}=`))
    ?.slice(DEVICE_COOKIE.length + 1);

  const deviceId = isDeviceId(current) ? current : newDeviceId();
  // A relative Location keeps the origin the browser actually used. Building an
  // absolute URL from request.url can normalise `127.0.0.1` to `localhost`
  // (dev server) or to an internal host behind a proxy, which would mint the
  // cookie for a different origin than the page the user is on.
  const response = new NextResponse(null, {
    status: 307,
    headers: { location: "/dashboard" },
  });
  response.cookies.set({
    name: DEVICE_COOKIE,
    value: deviceId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });
  return response;
}
