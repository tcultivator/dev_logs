import { CredentialsSignin } from "next-auth";

/** Safe codes returned to the login page. They do not include the password. */
export class LoginError extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

export function loginErrorMessage(code: string | undefined) {
  switch (code) {
    case "google_no_password":
      return "This email is a Google account and has no password yet. Sign in with Google. A blank password will not open it.";
    case "use_email_code":
      return "This email uses an email code, not a password.";
    case "google_otp_blocked":
      return "This email is a Google account. Email codes cannot open it. Sign in with Google, or with the password you set after that.";
    case "already_exists":
      return "That email already has an account. Sign in instead.";
    case "invalid_otp":
      return "That code is wrong or expired.";
    default:
      return "Email or password is wrong.";
  }
}
