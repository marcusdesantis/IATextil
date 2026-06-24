export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:5024',
  // LOCAL dev: pinned to the Allied Vision color simulator (DEV_Cam2) so testing
  // without the real camera behaves consistently. Leave empty to auto-pick instead.
  preferredCameraId: 'DEV_Cam2',
};
