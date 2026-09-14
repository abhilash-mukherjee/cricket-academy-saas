export const APP_NAME = "RestartHQ";
export const APP_DESCRIPTION = "Run your cricket Academy from one place!";
export const PRODUCT_HOMEPAGE_COPY = `Publish a brochure, collect Registrations, and manage your roster.
            Built for Academy Owners and Coaches — not for Players or Guardians
            to log in.`;

export const LOGIN_PAGE_COPY = `Sign in to your Academy Pro account`;
export const ACADEMY_NOT_FOUND = "Academy not found";
export const SLUG_HELP =
  "Lowercase letters, numbers, and hyphens. This becomes your public URL and cannot change later.";
export const MAGIC_LINK_EXPIRATION_TIME = 60 * 15;
export const MAGIC_LINK_EMAIL_SUBJECT = "Sign in to Academy Pro";
export const MAGIC_LINK_EMAIL_HTML = (url: string) => `<p><a href="${url}">Sign in to Academy Pro</a></p>`;

export const MAX_ACADEMY_IMAGE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const MAX_BROCHURE_GALLERY_IMAGES = 6;
