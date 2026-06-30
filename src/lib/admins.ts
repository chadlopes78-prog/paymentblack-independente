export const ADMIN_EMAILS = [
  "chadlopesff@gmail.com",
  "dercktuane@gmail.com",
] as const;

export const isAdminEmail = (email?: string | null): boolean =>
  !!email && ADMIN_EMAILS.includes(email.toLowerCase() as (typeof ADMIN_EMAILS)[number]);
