export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:5024',
  // Empty = auto-pick: prefer the real (non-simulator) camera if present, otherwise
  // fall back to the first available (a simulator) so pure-local dev still works.
  preferredCameraId: '',
};
