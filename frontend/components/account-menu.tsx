"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export function AccountMenu() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return null;
  }

  if (status === "unauthenticated") {
    return (
      <button
        onClick={() => signIn("google")}
        className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-[13px] text-foreground transition-colors hover:bg-secondary"
      >
        Sign in
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      {session?.user?.image && (
        // Tiny avatar from an external (Google) domain — not worth the next/image
        // remotePatterns config.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={session.user.image} alt="" className="h-6 w-6 rounded-full" />
      )}
      <span className="hidden text-[13px] text-muted-foreground sm:inline">
        {session?.user?.name}
      </span>
      <button
        onClick={() => signOut()}
        className="text-[13px] text-zinc-600 transition-colors hover:text-zinc-400"
      >
        Sign out
      </button>
    </div>
  );
}
