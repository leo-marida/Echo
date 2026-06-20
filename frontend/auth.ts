import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { SignJWT } from "jose";

const backendSecret = new TextEncoder().encode(process.env.AUTH_SECRET);

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        token.googleId = profile.sub ?? undefined;
        token.picture = profile.picture ?? undefined;
      }
      return token;
    },
    // Mints a separate, short-lived HS256 token for our own FastAPI backend — distinct
    // from NextAuth's own (encrypted) session cookie. The backend verifies this with the
    // same AUTH_SECRET (its BACKEND_JWT_SECRET) and never has to understand NextAuth's
    // internal session format.
    async session({ session, token }) {
      if (token.googleId && session.user?.email) {
        session.backendToken = await new SignJWT({
          sub: token.googleId,
          email: session.user.email,
          name: session.user.name,
          picture: token.picture,
        })
          .setProtectedHeader({ alg: "HS256" })
          .setIssuedAt()
          .setExpirationTime("1h")
          .sign(backendSecret);
      }
      return session;
    },
  },
});
