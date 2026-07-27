/*
 * Service worker tối giản — chỉ để trình duyệt coi đây là app cài được.
 *
 * CỐ Ý KHÔNG CACHE GÌ CẢ. Đây là app tiền bạc: một trang bill cũ nằm lại trong
 * cache rồi hiện ra lúc đang đối soát thì nguy hiểm hơn nhiều so với việc phải
 * chờ mạng. Listener 'fetch' rỗng = request đi thẳng ra mạng như thường, chỉ
 * khác là trình duyệt thấy có fetch handler nên cho phép cài.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
