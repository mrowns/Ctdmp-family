// Only the mock provider mode is enabled by configuration. A live adapter must
// construct its own approved YouTube destination during reviewed activation.
export function mockStreamDestination(videoId:string) {
 if(!/^[A-Za-z0-9_-]{11}$/.test(videoId))throw new Error('Invalid mock destination');
 return '/demo/streams/'+encodeURIComponent(videoId);
}
