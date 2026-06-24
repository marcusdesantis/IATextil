export const environment = {
  production: true,
  apiBaseUrl: 'http://localhost:5024',
  // CLIENT: pinned to the real Chromasens camera. pickCamera() also avoids the Intel-NIC
  // RDMA twin and prefers the GigE_Front01 interface. Confirm this id at install if needed.
  preferredCameraId: 'DEV_000A47FFF510',
};
