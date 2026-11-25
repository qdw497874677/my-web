// Requests capture both the current handler and epoch at dispatch time.
// An old request must never expire a subsequently established session.
let epoch = 0;
let handler: (() => void) | undefined;

export function captureOwnerSessionInvalidation(): () => void {
  const capturedEpoch = epoch;
  const capturedHandler = handler;
  return () => {
    if (capturedHandler && capturedHandler === handler && capturedEpoch === epoch) {
      capturedHandler();
    }
  };
}

export function advanceOwnerSessionEpoch(): void {
  epoch++;
}

export function registerOwnerSessionInvalidation(next: () => void): () => void {
  epoch++;
  handler = next;
  return () => {
    if (handler === next) {
      epoch++;
      handler = undefined;
    }
  };
}
