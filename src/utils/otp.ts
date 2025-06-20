export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function getOTPExpirationTime(): Date {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 5); // OTP expires in 5 minutes
  return now;
}

export function isOTPExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}
