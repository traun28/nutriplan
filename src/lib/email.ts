/**
 * Account email rules — shared by the sign-in form and the auth API routes.
 *
 * Accounts are Gmail-only: an address on any other domain (xyz.com, yahoo.com,
 * a college domain, …) is rejected. The rule lives here in exactly one place,
 * so the form gives immediate feedback with the same wording the API returns,
 * and the API stays authoritative for anything that bypasses the UI.
 */

/** The only domain an account may use. */
export const GMAIL_DOMAIN = "gmail.com";

/** Shown whenever the address is not on gmail.com. */
export const GMAIL_ONLY_MESSAGE =
  "Please use a @gmail.com email address — other domains are not accepted.";

/** Shown when the domain is right but the mailbox name is malformed. */
export const GMAIL_MALFORMED_MESSAGE =
  "That doesn't look like a valid Gmail address. Check the part before the @.";

/**
 * Gmail's own mailbox rules (Google's documented Gmail address requirements):
 * 6–30 characters; letters, digits, dots, dashes and underscores; must start
 * and end with a letter or digit; no runs of more than three consecutive
 * special characters (checked separately in `isGmailAddress`).
 */
const GMAIL_LOCAL_RE = /^[a-z0-9](?:[a-z0-9.+_-]{4,28})[a-z0-9]$/;
const GMAIL_CONSECUTIVE_SPECIALS_RE = /[.+_-]{4,}/;

/** True when `value` is an address on gmail.com with a well-formed mailbox. */
export function isGmailAddress(value: string): boolean {
  const email = value.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return false;

  const local = email.slice(0, at);
  return (
    email.slice(at + 1) === GMAIL_DOMAIN &&
    GMAIL_LOCAL_RE.test(local) &&
    !GMAIL_CONSECUTIVE_SPECIALS_RE.test(local)
  );
}

/**
 * Validates an address for sign-up / sign-in.
 *
 * Returns the message to show the user, or null when the address is accepted.
 */
export function validateGmailAddress(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length === 0) return "Enter your email address.";
  if (!email.endsWith(`@${GMAIL_DOMAIN}`)) return GMAIL_ONLY_MESSAGE;
  return isGmailAddress(email) ? null : GMAIL_MALFORMED_MESSAGE;
}
