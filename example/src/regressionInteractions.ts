export type NativeInteractionResult = {
  id: string;
  ok: boolean;
  detail: string;
};

export async function waitForNativeInteraction(
  id: string,
  action: string,
  readResult: () => Promise<NativeInteractionResult | null>,
  active: () => boolean,
) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    let result: NativeInteractionResult | null;
    try {
      result = await readResult();
    } catch (error) {
      // Background suspension can abort an in-flight result read.
      if (!(error instanceof Error && error.name === 'AbortError')) throw error;
      result = null;
    }
    if (result?.id === id) {
      if (!result.ok) throw new Error(result.detail);
      return;
    }
    if (!active()) throw new Error('Regression screen was removed');
    await new Promise<void>(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Native interaction ${action} timed out`);
}
