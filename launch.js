const entry = document.createElement('script');
if (location.protocol === 'file:') {
  entry.src = './offline.js';
} else {
  entry.type = 'module';
  entry.src = './store.js';
}
document.head.appendChild(entry);
