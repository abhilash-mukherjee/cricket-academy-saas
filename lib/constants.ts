export const APP_NAME = "restartHQ";
export const APP_DESCRIPTION = "The Operating System for Next Gen Sports Academies!";
export const PRODUCT_HOMEPAGE_COPY = `Manage athletes, coaches, operations, and growth — all from one dashboard.`;

export const LOGIN_PAGE_COPY = `Sign in to your Academy Pro account`;
export const ACADEMY_NOT_FOUND = "Academy not found";
export const SLUG_HELP =
  "Lowercase letters, numbers, and hyphens. This becomes your public URL and cannot change later.";
export const MAGIC_LINK_EXPIRATION_TIME = 60 * 15;
export const MAGIC_LINK_EMAIL_SUBJECT = "Sign in to RestartHQ";
export const MAGIC_LINK_EMAIL_HTML = (url: string) => `<p>Hello! Welcome to RestartHQ! Click on the link to sign in to your account: <a href="${url}">Sign in to RestartHQ</a></p>`;

export const MAX_ACADEMY_IMAGE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const MAX_BROCHURE_GALLERY_IMAGES = 6;
