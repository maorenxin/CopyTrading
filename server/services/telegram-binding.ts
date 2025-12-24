export interface TelegramBindingInput {
  telegramUserId: string;
  walletAddress: string;
  signature: string;
}

export async function createBindingLink(telegramUserId: string) {
  return { bindId: '', bindUrl: '', status: 'pending' };
}

export async function confirmBinding(input: TelegramBindingInput) {
  void input;
  return { bindId: '', status: 'verified' };
}
