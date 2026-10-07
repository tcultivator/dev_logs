import { auth } from "@/auth";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id || session.user.needsPassword) return null;
  return session.user;
}
