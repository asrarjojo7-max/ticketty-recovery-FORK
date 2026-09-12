export interface PasswordChangeState {
  mustChangePassword: boolean;
}

export function destinationAfterLogin(user: PasswordChangeState): string {
  return user.mustChangePassword ? "/change-password" : "/dashboard";
}
