import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { writeAudit } from "./audit";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

const COOKIE = "tid_session";

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return new TextEncoder().encode(secret);
}

export async function signSession(user: SessionUser) {
  return new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .setSubject(user.id)
    .sign(authSecret());
}

export async function readSession(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret());
    return {
      id: String(payload.id),
      email: String(payload.email),
      name: String(payload.name),
      role: String(payload.role),
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await readSession();
  if (!user) redirect("/login");
  return user;
}

export async function login(email: string, password: string, ip?: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.active) {
    return { error: "Invalid email or password." };
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return { error: "Invalid email or password." };
  const session: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
  const token = await signSession(session);
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await writeAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "LOGIN",
    entityType: "User",
    entityId: user.id,
    ip,
  });
  return { user: session };
}

export async function logout() {
  const user = await readSession();
  cookies().delete(COOKIE);
  if (user) {
    await writeAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: "LOGOUT",
      entityType: "User",
      entityId: user.id,
    });
  }
}

export function canManageGdpr(role: string) {
  return role === "ADMIN" || role === "COMPLIANCE";
}
