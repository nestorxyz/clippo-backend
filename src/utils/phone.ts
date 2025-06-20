export function formatPhoneNumber(phoneNumber: string): string {
  // Remove all non-numeric characters except leading +
  let cleaned = phoneNumber.replace(/[^\d+]/g, '');

  // Ensure it starts with +
  if (!cleaned.startsWith('+')) {
    // If it's a US number without country code, add +1
    if (cleaned.length === 10) {
      cleaned = '+1' + cleaned;
    } else {
      cleaned = '+' + cleaned;
    }
  }

  return cleaned;
}

export function extractPhoneNumber(whatsappId: string): string {
  // WhatsApp IDs come in format like "1234567890" without the +
  // We need to add the + back
  return '+' + whatsappId;
}
