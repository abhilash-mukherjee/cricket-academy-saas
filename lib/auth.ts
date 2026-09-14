import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import * as authSchema from "@/db/auth-schema";
import { getDb } from "@/db/client";
import { sendMail } from "@/lib/mailer";
import { MAGIC_LINK_EMAIL_HTML, MAGIC_LINK_EMAIL_SUBJECT, MAGIC_LINK_EXPIRATION_TIME } from "./constants";

function authBaseUrl(): string {
  const url =
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";

  return url.replace(/\/$/, "");
}

function authSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) {
    return secret;
  }

  throw new Error("BETTER_AUTH_SECRET is not set");
}

function createAuth() {
  return betterAuth({
    baseURL: authBaseUrl(),
    secret: authSecret(),
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: authSchema.user,
        session: authSchema.session,
        account: authSchema.account,
        verification: authSchema.verification,
      },
    }),
    user: {
      additionalFields: {
        isSuperAdmin: {
          type: "boolean",
          required: false,
          defaultValue: false,
        },
      },
    },
    advanced: {
      database: {
        generateId: false,
      },
    },
    plugins: [
      magicLink({
        expiresIn: MAGIC_LINK_EXPIRATION_TIME,
        sendMagicLink: async ({ email, url }) => {
          await sendMail({
            to: email,
            subject: MAGIC_LINK_EMAIL_SUBJECT,
            html: MAGIC_LINK_EMAIL_HTML(url),
          });
        },
      }),
      nextCookies(),
    ],
  });
}

type AuthInstance = ReturnType<typeof createAuth>;

let authInstance: AuthInstance | undefined;

export function getAuth(): AuthInstance {
  if (!authInstance) {
    authInstance = createAuth();
  }

  return authInstance;
}

export const auth = new Proxy({} as AuthInstance, {
  get(_target, property, receiver) {
    return Reflect.get(getAuth(), property, receiver);
  },
});
