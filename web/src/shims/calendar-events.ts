// The browser has no calendar API: report "denied" so the Phone Assistant explains the limitation.
export default {
  requestPermissions: async () => 'denied',
  checkPermissions: async () => 'denied',
  fetchAllEvents: async () => [],
  saveEvent: async () => { throw new Error('Calendar access is not available in the web build'); },
  findCalendars: async () => [],
};
